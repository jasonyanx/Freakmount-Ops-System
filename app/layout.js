import './globals.css';

export const metadata = {
  title: 'Freakmount Ops',
  description: 'Internal ops dashboard: reorders, PO follow-ups, fulfillment exceptions, cash flow.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
