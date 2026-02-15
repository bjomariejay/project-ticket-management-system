# Development Guide

## Creating a Project
1. Click the `+ Project` button in the Projects panel. This triggers `openCreateProject()` which sets `showCreateProject` to true and reveals the Create Project modal.
2. Complete the form fields (Name, Slug, Ticket Prefix, Description). Each input is bound through `updateCreateProjectField` so state updates immediately while you type.
3. Press the `Create project` button. The submit handler (`handleProjectSubmit`) calls `createProject()`, which clamps/slugifies the form values, logs the payload for debugging, sends it to the API with `apiClient.createProject`, then reloads projects/tickets once the server responds.

## Creating a Ticket
1. Click the `+ Ticket` button beside the Projects header. This calls `openCreateTicket()` and shows the Create Ticket modal.
2. Fill in the ticket details (Title, Description, Project, Estimated hours, Priority, Privacy). Inputs use `updateCreateTicketField` to keep the draft in sync.
3. Click `Create ticket`. `handleTicketSubmit()` invokes `createTicket()`, posting the new ticket to the API. On success the ticket list refreshes and the modal closes.
