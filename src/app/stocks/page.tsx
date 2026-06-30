import HoldingsTable from "@/components/HoldingsTable";

export default function StocksPage() {
  return (
    <HoldingsTable
      title="Stocks"
      addLabel="Stock"
      apiType="STOCK"
      fixedType="STOCK"
      quantityLabel="Qty"
      extraCols={{ avgLabel: "Avg Price", currentLabel: "Current Price" }}
      showIsin
    />
  );
}
