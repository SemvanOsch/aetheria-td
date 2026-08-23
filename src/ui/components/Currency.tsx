export function Currency({ amount }: { amount: number }) {
  return (
    <span className="currency" title="Gold — spent deploying units in stages">
      <span className="coin">🪙</span>
      {amount.toLocaleString()}
    </span>
  );
}

export function Gems({ amount }: { amount: number }) {
  return (
    <span className="currency gems" title="Gems — spent on summons">
      <span className="coin">💎</span>
      {amount.toLocaleString()}
    </span>
  );
}
