const { v4: uuidv4 } = require("uuid");
const { pool, query } = require("../config/database");
const { mapUser } = require("../models/userModel");
const { asyncHandler } = require("../utils/asyncHandler");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createExpiryClaim, signToken } = require("../utils/token");

const login = asyncHandler(async (req, res) => {
  const rawIdentifier = (req.body?.username ?? req.body?.handle ?? "")
    .trim()
    .toLowerCase();
  const { password } = req.body || {};
  console.log("be login payload data", req.body);
  if (!rawIdentifier || !password) {
    return res
      .status(400)
      .json({ message: "username and password are required" });
  }

  const {
    rows: [user],
  } = await query(
    `SELECT u.id,
            u.display_name,
            u.username,
            u.handle,
            u.location,
            u.password_hash,
            u.workspace_id,
            u.is_active,
            w.name AS workspace_name
       FROM users u
       LEFT JOIN workspaces w ON u.workspace_id = w.id
      WHERE u.username = $1`,
    [rawIdentifier],
  );

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await query("UPDATE users SET is_active = true WHERE id = $1", [user.id]);

  console.log("be selected user:", user);

  const data = {
    userId: user.id,
    handle: user.handle,
    workspaceId: user.workspace_id,
    exp: createExpiryClaim(),
  }
  const token = signToken(data);

  console.log("be data:", data);
    console.log("be create token:", token);
  
  res.json({
    token,
    user: { ...mapUser(user), isActive: true },
  });
});

const register = asyncHandler(async (req, res) => {
  const {
    displayName,
    handle,
    email,
    password,
    location,
    username,
    workspaceName,
  } = req.body || {};
  if (!displayName || !handle || !email || !password || !workspaceName) {
    return res.status(400).json({
      message:
        "displayName, handle, email, password and workspaceName are required",
    });
  }

  const normalizedWorkspaceName = workspaceName.trim().toLowerCase();
  if (!normalizedWorkspaceName) {
    return res.status(400).json({ message: "workspaceName is required" });
  }

  const passwordHash = hashPassword(password);
  const userId = uuidv4();
  const client = await pool.connect();
  let workspaceId = "";
  let workspaceDisplayName = normalizedWorkspaceName;

  try {
    await client.query("BEGIN");
    const existingWorkspace = await client.query(
      "SELECT id, name FROM workspaces WHERE name = $1",
      [normalizedWorkspaceName],
    );

    if (existingWorkspace.rowCount) {
      workspaceId = existingWorkspace.rows[0].id;
      workspaceDisplayName = existingWorkspace.rows[0].name;
    } else {
      workspaceId = uuidv4();
      try {
        await client.query(
          "INSERT INTO workspaces (id, name) VALUES ($1, $2)",
          [workspaceId, normalizedWorkspaceName],
        );
      } catch (workspaceError) {
        if (workspaceError.code === "23505") {
          const fallback = await client.query(
            "SELECT id, name FROM workspaces WHERE name = $1",
            [normalizedWorkspaceName],
          );
          if (fallback.rowCount) {
            workspaceId = fallback.rows[0].id;
            workspaceDisplayName = fallback.rows[0].name;
          } else {
            throw workspaceError;
          }
        } else {
          throw workspaceError;
        }
      }
    }

    await client.query(
      `INSERT INTO users (
        id, display_name, username, handle, email, password_hash, location, workspace_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        displayName,
        (username || handle).toLowerCase(),
        handle.toLowerCase(),
        email.toLowerCase(),
        passwordHash,
        location,
        workspaceId,
        true,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      switch (error.constraint) {
        case "users_username_key":
          return res.status(409).json({ message: "Username already exists" });
        case "users_email_key":
          return res.status(409).json({ message: "Email already exists" });
        case "users_workspace_handle_unique":
          return res
            .status(409)
            .json({ message: "Handle already exists in this workspace" });
        default:
          return res.status(409).json({ message: "Account already exists" });
      }
    }
    throw error;
  } finally {
    client.release();
  }

  const token = signToken({
    userId,
    handle: handle.toLowerCase(),
    workspaceId,
    exp: createExpiryClaim(),
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      displayName,
      username: (username || handle).toLowerCase(),
      handle: handle.toLowerCase(),
      location,
      workspaceId,
      workspaceName: workspaceDisplayName,
      isActive: true,
    },
  });
});

module.exports = { login, register };
