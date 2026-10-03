import { Icon } from './Icon';

export function Currency({ amount }: { amount: number }) {
  return (
    <span className="currency" title="Gold — spent deploying units in stages">
      <span className="coin">
        <Icon name="coin" />
      </span>
      {amount.toLocaleString()}
    </span>
  );
}

export function Gems({ amount }: { amount: number }) {
  return (
    <span className="currency gems" title="Gems — spent on summons">
      <span className="coin">
        <Icon name="gem" />
      </span>
      {amount.toLocaleString()}
    </span>
  );
}
