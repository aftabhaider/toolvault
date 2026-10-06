/**
 * ToolVault Paint Calculator engine
 * Geometry and product-coverage math are kept separate from the UI.
 * All calculations use full precision; UI rounds only displayed values.
 */

const M2_PER_FT2 = 0.09290304;
const LITERS_PER_US_GALLON = 3.785411784;

export function positive(value, fallback=0){
  const n=Number(value);
  return Number.isFinite(n) && n>=0 ? n : fallback;
}

export function calculatePaint(input={}){
  const mode=input.mode==="area" ? "area" : "room";
  const coats=Math.max(1, Math.floor(positive(input.coats,2)));
  const coverage=Math.max(Number.EPSILON, positive(input.coverageM2PerL,10));
  const waste=Math.max(0, positive(input.wastePercent,5));

  let grossWallArea=0;
  let openingArea=0;
  let ceilingArea=0;
  let extraArea=0;

  if(mode==="room"){
    const length=Math.max(0, positive(input.roomLengthM,0));
    const width=Math.max(0, positive(input.roomWidthM,0));
    const height=Math.max(0, positive(input.wallHeightM,0));

    grossWallArea = 2 * (length + width) * height;
    openingArea = Math.min(grossWallArea, positive(input.openingAreaM2,0));
    if(input.includeCeiling){
      ceilingArea = length * width;
    }
    extraArea = positive(input.extraAreaM2,0);
  }else{
    const knownArea=Math.max(0, positive(input.knownAreaM2,0));
    openingArea=Math.min(knownArea, positive(input.openingAreaM2,0));
    grossWallArea=knownArea;
    extraArea=positive(input.extraAreaM2,0);
  }

  const netSurfaceArea=Math.max(0, grossWallArea-openingArea+ceilingArea+extraArea);
  const coatedArea=netSurfaceArea*coats;
  const theoreticalLiters=coatedArea/coverage;
  const purchaseLiters=theoreticalLiters*(1+waste/100);
  const gallons=purchaseLiters/LITERS_PER_US_GALLON;

  const canSize=Math.max(0, positive(input.canSizeL,0));
  const canCount=canSize>0 ? Math.ceil(purchaseLiters/canSize) : null;

  const pricePerLiter=Math.max(0, positive(input.pricePerLiter,0));
  const cost=pricePerLiter>0 ? purchaseLiters*pricePerLiter : null;

  return {
    mode,coats,coverage,waste,
    grossWallArea,openingArea,ceilingArea,extraArea,netSurfaceArea,
    coatedArea,theoreticalLiters,purchaseLiters,gallons,canSize,canCount,
    pricePerLiter,cost
  };
}

export const conversions={
  ft2ToM2: ft2 => positive(ft2)*M2_PER_FT2,
  m2ToFt2: m2 => positive(m2)/M2_PER_FT2,
  litersToGallons: liters => positive(liters)/LITERS_PER_US_GALLON,
  gallonsToLiters: gallons => positive(gallons)*LITERS_PER_US_GALLON
};
