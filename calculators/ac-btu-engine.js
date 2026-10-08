/**
 * ToolVault AC / BTU calculator engine
 *
 * Room-AC planning estimate based primarily on the ENERGY STAR room-air-conditioner
 * capacity chart, with transparent planning adjustments for ceiling height, sun,
 * occupancy and kitchen use.
 *
 * Important: this is for a single room / zone. It is not a whole-building ACCA
 * Manual J or other full HVAC load calculation.
 */

export const BTU_PER_TON = 12000;
export const BTU_PER_KW_COOLING = 3412.141633;
export const STANDARD_ROOM_AC_BTUS = [
  5000,6000,7000,8000,9000,10000,12000,14000,18000,21000,23000,24000,30000,34000,36000,42000,48000,60000
];

/**
 * ENERGY STAR room-air-conditioner capacity chart.
 * Boundaries are represented as the chart's upper "up to" value.
 */
export const ROOM_AC_CHART = [
  {maxSqFt:150,btu:5000},
  {maxSqFt:250,btu:6000},
  {maxSqFt:300,btu:7000},
  {maxSqFt:350,btu:8000},
  {maxSqFt:400,btu:9000},
  {maxSqFt:450,btu:10000},
  {maxSqFt:550,btu:12000},
  {maxSqFt:700,btu:14000},
  {maxSqFt:1000,btu:18000},
  {maxSqFt:1200,btu:21000},
  {maxSqFt:1400,btu:23000},
  {maxSqFt:1500,btu:24000},
  {maxSqFt:2000,btu:30000},
  {maxSqFt:2500,btu:34000}
];

const SQFT_PER_M2 = 10.763910416709722;

function positive(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:fallback;
}

function chooseChartBTU(areaSqFt){
  for(const row of ROOM_AC_CHART){
    if(areaSqFt<=row.maxSqFt) return row.btu;
  }
  return null;
}

function chooseNextStandardBTU(btu){
  return STANDARD_ROOM_AC_BTUS.find(x=>x>=btu) ?? null;
}

export function calculateAcBtu(input={}){
  const lengthM=positive(input.lengthM);
  const widthM=positive(input.widthM);
  const ceilingM=positive(input.ceilingM,2.4384);
  const occupants=Math.max(0,Math.floor(positive(input.occupants,2)));
  const sun=input.sunExposure||"normal";
  const kitchen=Boolean(input.kitchen);

  if(!(lengthM>0)) return {ok:false,error:"Enter a room length greater than zero."};
  if(!(widthM>0)) return {ok:false,error:"Enter a room width greater than zero."};
  if(!(ceilingM>0)) return {ok:false,error:"Enter a ceiling height greater than zero."};

  const areaM2=lengthM*widthM;
  const areaSqFt=areaM2*SQFT_PER_M2;
  const chartBaseBTU=chooseChartBTU(areaSqFt);

  if(chartBaseBTU===null){
    return {
      ok:false,
      reason:"area-too-large",
      areaM2,
      areaSqFt,
      error:"This room is larger than the current room-AC sizing chart. Use a full HVAC load calculation for larger spaces."
    };
  }

  // ENERGY STAR's chart is based on an 8 ft ceiling. For a planning estimate,
  // raise capacity proportionally only above 8 ft; lower ceilings do not reduce
  // the chart value because the published chart does not provide a lower-ceiling
  // reduction rule.
  const eightFtM=2.4384;
  const ceilingFactor=Math.max(1,ceilingM/eightFtM);

  const sunFactors={shaded:0.90,normal:1.00,sunny:1.10};
  const sunFactor=sunFactors[sun]??1;

  const extraOccupants=Math.max(0,occupants-2);
  const occupantBTU=extraOccupants*600;
  const kitchenBTU=kitchen?4000:0;

  const ceilingAdjustedBTU=chartBaseBTU*ceilingFactor;
  const sunAdjustedBTU=ceilingAdjustedBTU*sunFactor;
  const estimatedBTU=sunAdjustedBTU+occupantBTU+kitchenBTU;

  const recommendedBTU=chooseNextStandardBTU(estimatedBTU);
  const recommendedTons=recommendedBTU===null?null:recommendedBTU/BTU_PER_TON;
  const recommendedCoolingKW=recommendedBTU===null?null:recommendedBTU/BTU_PER_KW_COOLING;

  return {
    ok:true,
    areaM2,
    areaSqFt,
    ceilingM:ceilingM,
    ceilingFt:ceilingM/0.3048,
    chartBaseBTU,
    ceilingFactor,
    ceilingAdjustedBTU,
    sun,
    sunFactor,
    sunAdjustedBTU,
    occupants,
    extraOccupants,
    occupantBTU,
    kitchen,
    kitchenBTU,
    estimatedBTU,
    recommendedBTU,
    recommendedTons,
    recommendedCoolingKW,
    supportedChartMaxSqFt:2500
  };
}

export const conversions={
  mToFt:m=>m/0.3048,
  ftToM:ft=>ft*0.3048,
  m2ToFt2:m2=>m2*SQFT_PER_M2,
  ft2ToM2:ft2=>ft2/SQFT_PER_M2
};
