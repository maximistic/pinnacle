import HoldingsTable from "@/components/HoldingsTable";

export default function StocksPage() {
  return (
    <HoldingsTable
      title="Stocks"
      addLabel="Stock"
      apiType="STOCK"
      fixedType="STOCK"
    />
  );
}
