export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="notice">
      <strong>Setup incomplete</strong>
      <p>
        The app runs without these, but login is disabled until they are set in{" "}
        <code>.env.local</code>:
      </p>
      <ul>
        {missing.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
