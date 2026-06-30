import HoldingsTable from "@/components/HoldingsTable";

const TYPE_OPTIONS = [
  { value: "FD", label: "Fixed Deposit" },
  { value: "GOLD", label: "Gold" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "OTHER", label: "Other" },
];

const FILTER_TYPES = ["FD", "GOLD", "REAL_ESTATE", "OTHER"];

export default function OthersPage() {
  return (
    <HoldingsTable
      title="Others"
      addLabel="Holding"
      filterTypes={FILTER_TYPES}
      typeOptions={TYPE_OPTIONS}
      showQuantity={false}
    />
  );
}
