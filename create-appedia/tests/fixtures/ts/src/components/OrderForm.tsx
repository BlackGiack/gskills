import { useState } from "react";
import type { Item } from "@/types";

interface Props {
  onSubmit: (items: Item[]) => void;
}

/** Collects items and submits a new order. */
export const OrderForm = ({ onSubmit }: Props) => {
  const [sku, setSku] = useState<string>("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit([{ sku, quantity: 1 }]);
    setSku("");
  };
  return (
    <form onSubmit={handleSubmit}>
      <input value={sku} onChange={e => setSku(e.target.value)} />
      <button type="submit">Place order</button>
    </form>
  );
};
