/** App footer. Presentational; lives in the app since it pairs with the shell. */
export function Footer() {
  return (
    <footer className="app-footer">
      <span>© {new Date().getFullYear()} msd</span>
    </footer>
  );
}
