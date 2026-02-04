const TransactionList = ({ transactions = [] }) => (
  <ul>
    {transactions.map((t, i) => (
      <li key={i} className="py-1">{t.description}</li>
    ))}
  </ul>
);

export default TransactionList;
