import HoldingsTable from "@/components/HoldingsTable";

export default function MutualFundsPage() {
  return (
    <HoldingsTable
      title="Mutual Funds"
      addLabel="Mutual Fund"
      apiType="MUTUAL_FUND"
      fixedType="MUTUAL_FUND"
      quantityLabel="Units"
      extraCols={{ avgLabel: "Avg NAV", currentLabel: "Current NAV" }}
      showIsin
      showFolioNumber
    />
  );
}
