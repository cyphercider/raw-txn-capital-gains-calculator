import { Moment } from "moment"

export interface InputRow {
  id: string
  exchange: string
  action: "Buy" | "Sell"
  date: string
  asset: string
  quantity: number
  amount: number
}

export interface FinalResult {
  qtySold: number
  gainLoss: number
  fragments: SellTxnFragment[]
}

export interface ResultBundle {
  buys: BuyTransaction[]
  sells: SellTransaction[]
}

export interface SellTransaction {
  id: string
  exchange: string
  asset: string
  date: Date
  saleQty: number
  amt: number
  fragments: SellTxnFragment[]
  qtyLeft: number
  unitCost: number
  gainLoss: number
}

export interface BuyTransaction {
  id: string
  exchange: string
  asset: string
  date: Date
  qtyBought: number
  amt: number
  unitCost: number
  qtySold: number
  qtyLeft: number
}

export interface SellTxnFragment {
  id: string
  asset: string
  sellTxnId: string
  buyTxnId: string
  fragmentSellQty: number
  costBasis: number
  proceeds: number
  gainLoss: number
  buyTxnTotalQty: number
  buyTxnFraction: number
  sellTxnTotalQty: number
  sellTxnFraction: number
  remainingSellQtyAfter: number
}
