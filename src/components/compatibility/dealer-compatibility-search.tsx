"use client";

import VehicleCascadeSearch from "@/components/vehicle-cascade-search";

/** Dealer / staff compatibility page — URL-driven cascade + free-text search. */
export default function DealerCompatibilitySearch({
  makes,
  modelsByMake,
  yearOptions,
  initial,
  actionPath,
  extraParams,
}: {
  makes: string[];
  modelsByMake: Record<string, string[]>;
  yearOptions: number[];
  initial: { make?: string; model?: string; year?: string; q?: string };
  actionPath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <VehicleCascadeSearch
      makes={makes}
      modelsByMake={modelsByMake}
      yearOptions={yearOptions}
      initial={initial}
      actionPath={actionPath}
      extraParams={extraParams}
      makeEmptyLabel="Please select"
      modelEmptyLabel="Please select"
      showTextSearch
      textSearchPlaceholder="Type a letter or name (e.g. a, Audi, RAV4)…"
    />
  );
}
