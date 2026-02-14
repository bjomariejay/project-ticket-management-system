const Loader = ({ label = 'Loading…' }: { label?: string }) => {
  return (
    <div style={{ textAlign: 'center', padding: '1rem' }}>
      <span className="muted">{label}</span>
    </div>
  );
};

export default Loader;
