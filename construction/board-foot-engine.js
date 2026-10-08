/**
 * ToolVault Board Foot Calculator engine
 *
 * Board foot = 144 cubic inches.
 * With thickness/width in inches and length in feet:
 * BF per board = thickness_in * width_in * length_ft / 12
 *
 * UI rounding is separate from calculation precision.
 */

const IN_TO_M = 0.0254;
const FT_TO_M = 0.3048;
const CUBIC_IN_PER_BF = 144;
const CUBIC_FT_PER_BF = 1/12;
const M3_PER_BF = CUBIC_IN_PER_BF * Math.pow(IN_TO_M,3);

export const conversions = { IN_TO_M, FT_TO_M, CUBIC_IN_PER_BF, CUBIC_FT_PER_BF, M3_PER_BF };

export function positive(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:fallback;
}

export function parseFraction(value,fallback=0){
  if(typeof value==="number") return positive(value,fallback);
  const s=String(value??"").trim().replace(/″/g,'"').replace(/′/g,"'");
  if(!s) return fallback;
  const mixed=s.match(/^([+-]?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if(mixed){
    const whole=Number(mixed[1]),num=Number(mixed[2]),den=Number(mixed[3]);
    return Number.isFinite(whole)&&den>0?whole+num/den:fallback;
  }
  const frac=s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if(frac){
    const num=Number(frac[1]),den=Number(frac[2]);
    return den>0?num/den:fallback;
  }
  const n=Number(s);
  return Number.isFinite(n)?Math.max(0,n):fallback;
}

export function calculateBoard(row={}){
  const thicknessIn=positive(row.thicknessIn);
  const widthIn=positive(row.widthIn);
  const lengthFt=positive(row.lengthFt);
  const quantity=Math.max(0,Math.floor(positive(row.quantity,1)));
  const bfPerBoard=(thicknessIn*widthIn*lengthFt)/12;
  const boardFeet=bfPerBoard*quantity;
  return {
    thicknessIn,widthIn,lengthFt,quantity,
    bfPerBoard,boardFeet,
    cubicFeet:boardFeet/12,
    cubicMeters:boardFeet*M3_PER_BF
  };
}

export function calculateProject(input={}){
  const rows=Array.isArray(input.rows)?input.rows:[];
  const wastePercent=Math.max(0,positive(input.wastePercent,0));
  const pricePerBF=Math.max(0,positive(input.pricePerBF,0));
  const items=rows.map((row,index)=>({...calculateBoard(row),name:String(row.name||("Board "+(index+1)))}));
  const rawBoardFeet=items.reduce((sum,item)=>sum+item.boardFeet,0);
  const wasteBoardFeet=rawBoardFeet*(wastePercent/100);
  const purchaseBoardFeet=rawBoardFeet+wasteBoardFeet;
  const cost=pricePerBF>0?purchaseBoardFeet*pricePerBF:null;
  return {
    items,rawBoardFeet,wasteBoardFeet,purchaseBoardFeet,wastePercent,
    pricePerBF,cost,totalPieces:items.reduce((sum,item)=>sum+item.quantity,0),
    cubicFeet:purchaseBoardFeet/12,cubicMeters:purchaseBoardFeet*M3_PER_BF
  };
}
