"use client";

import VehicleCascadeSearch from "@/components/vehicle-cascade-search";

/** Dealer / staff compatibility page — URL-driven cascade search. */
export default function DealerCompatibilitySearch({
  makes,
  modelsByMake,
  yearOptions,
  initial,
  actionPath,
}: {
  makes: string[];
  modelsByMake: Record<string, string[]>;
  yearOptions: number[];
  initial: { make?: string; model?: string; year?: string };
  actionPath: string;
}) {
  return (
    <VehicleCascadeSearch
      makes={makes}
      modelsByMake={modelsByMake}
      yearOptions={yearOptions}
      initial={initial}
      actionPath={actionPath}
    />
  );
}
