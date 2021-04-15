import fs from "fs"
import path from "path"
import { getConfig } from "./config.function"
import {
  BuyTransaction,
  InputRow,
  ResultBundle,
  SellTxnFragment,
  SellTransaction,
  FinalResult,
} from "./types.interface"
require("dotenv").config()
import neatCsv from "neat-csv"
import moment, { isDate } from "moment"
import _ from "lodash"
const xlsx = require("xlsx")

const config = getConfig()

async function calculateGains(): Promise<void> {
  const inputs = await getInputs()

  const results = processTxns(inputs)

  // console.log(`buy txns are`, results)
}

/**
 * Process txns algorithm
 * 1. Iterate through inputs and build the arrays of buy transactions and sell transactions
 * 2. Sort buy transactions by highest cost to lowest cost.
 * 3. Iterate through sell transactions.  For each, process sell by selling highest basis purchases first.  Build up array of buy txns contributing to the sell qty.  For each buy txn sold, sell transaction to tracking array.  Update buy txn array with new qty left.
 * 4. Generate three separate csvs: buy txns, sell txns, all txns, for reporting.
 */
function processTxns(inputRows: InputRow[]): ResultBundle {
  // 1. Iterate through inputs and build the arrays of buy transactions and sell transactions
  const buys = inputRows.filter((row) => row.action === "Buy").map((x) => inputRowToBuyTxn(x))
  const sells = inputRows.filter((row) => row.action === "Sell").map((x) => inputRowToSaleTxn(x))

  buys.forEach((txn) => {
    txn.unitCost = _.round(txn.amt / txn.qtyBought, 8)
  })

  sells.forEach((txn) => {
    txn.unitCost = _.round(txn.amt / txn.saleQty, 8)
  })

  // 2. Sort buy transactions by highest cost to lowest cost.
  buys.sort((a, b) => {
    return a.unitCost > b.unitCost ? -1 : 1
  })

  // 3. Iterate through sell transactions.  For each, process sell by selling highest basis purchases first.  Build up array of buy txns contributing to the sell qty.  For each buy txn sold, sell transaction to tracking array.  Update buy txn array with new qty left.
  sells.forEach((sell) => {
    processSellTxn(sell, buys)
  })

  // 4. Generate three separate csvs: buy txns, sell txns, all txns, for reporting.
  const report = makeFinalReport(sells, buys)

  console.log(`WRITING`)

  writeWorkbook(report.fragments, inputRows, sells, buys)

  return { buys, sells }
}

function makeFinalReport(sells: SellTransaction[], buys: BuyTransaction[]): FinalResult {
  console.log(`sells `, sells.length)
  const fragments: SellTxnFragment[] = []

  sells.forEach((sell) => {
    fragments.push(...sell.fragments)
  })

  let gainLoss = 0
  for (let i = 0; i < fragments.length; i++) {
    fragments[i].gainLoss = _.round(fragments[i].gainLoss, 2)
    fragments[i].proceeds = _.round(fragments[i].proceeds, 2)
    fragments[i].costBasis = _.round(fragments[i].costBasis, 2)
    gainLoss += fragments[i].gainLoss
  }
  // const gainLoss = fragments.reduce((prev, curr) => {
  //   return curr.gainLoss + prev
  // }, 0)

  let qtySold = 0
  for (let i = 0; i < fragments.length; i++) {
    qtySold += fragments[i].fragmentSellQty
  }
  // const qtySold = fragments.reduce((prev, curr) => {
  //   return parseInt(curr.qtySold, 10) + prev
  // }, 0)

  // console.log(`fragments`, fragments)

  return {
    qtySold,
    gainLoss,
    fragments,
  }
}

async function writeWorkbook(
  fragments: SellTxnFragment[],
  inputs: InputRow[],
  sells: SellTransaction[],
  buys: BuyTransaction[]
) {
  try {
    const workbook = xlsx.utils.book_new()

    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(inputs), "Inputs")
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(sells), "Sell Txns")
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(buys), "Buy Txns")
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(fragments), "Sell Fragments")

    const outpath = path.join(__dirname, config.outputFile)
    console.log(`path `, outpath.toString())
    xlsx.writeFile(workbook, outpath)
  } catch (err) {
    console.error(`error writing excel workbook!`, err)
  }
}

function processSellTxn(sell: SellTransaction, buys: BuyTransaction[]) {
  let fragmentCounter = 0
  for (let i = 0; i < buys.length; i++) {
    const buy = buys[i]
    if (sell.date < buy.date || sell.asset !== buy.asset) {
      continue
    }

    if (buy.qtyLeft > 0) {
      fragmentCounter += 1
      // There is some left not sold.  We want to sell some of it.
      const fragment: SellTxnFragment = {
        id: `${sell.id}-${fragmentCounter}`,
        asset: sell.asset,
        sellTxnId: sell.id,
        buyTxnId: buy.id,
        fragmentSellQty: -1,
        costBasis: -1,
        proceeds: -1,
        gainLoss: -1,
        sellTxnTotalQty: sell.saleQty,
        sellTxnFraction: -1,
        buyTxnTotalQty: buy.qtyBought,
        buyTxnFraction: -1,
        remainingSellQtyAfter: -1,
      }

      console.log(fragmentCounter)

      const sign = Math.sign(buy.qtyLeft - sell.qtyLeft)
      switch (sign) {
        // 1. There is more than enough to close the sell txn (buy qty left > sell qty left)
        case 1:
          // console.log(`CASE 1`)
          fragment.fragmentSellQty = sell.qtyLeft
          fragment.costBasis = fragment.fragmentSellQty * buy.unitCost
          fragment.proceeds = fragment.fragmentSellQty * sell.unitCost
          fragment.gainLoss = fragment.proceeds - fragment.costBasis
          sell.fragments.push(fragment)
          sell.qtyLeft = 0
          buy.qtyLeft = buy.qtyLeft - fragment.fragmentSellQty
          fragment.buyTxnFraction = fragment.fragmentSellQty / fragment.buyTxnTotalQty
          fragment.sellTxnFraction = fragment.fragmentSellQty / fragment.sellTxnTotalQty
          fragment.remainingSellQtyAfter = sell.qtyLeft
          sell.gainLoss += fragment.gainLoss
          return
        // 0. There is exactly enough to sell
        case 0:
          // console.log(`CASE 0`)
          fragment.fragmentSellQty = sell.qtyLeft
          fragment.costBasis = fragment.fragmentSellQty * buy.unitCost
          fragment.proceeds = fragment.fragmentSellQty * sell.unitCost
          fragment.gainLoss = fragment.proceeds - fragment.costBasis
          sell.fragments.push(fragment)
          sell.qtyLeft = 0
          buy.qtyLeft = 0
          fragment.buyTxnFraction = fragment.fragmentSellQty / fragment.buyTxnTotalQty
          fragment.sellTxnFraction = fragment.fragmentSellQty / fragment.sellTxnTotalQty
          fragment.remainingSellQtyAfter = sell.qtyLeft
          sell.gainLoss += fragment.gainLoss
        // -1. There is not enough to close the sell txn (sell qty left > buy qty left)
        case -1:
          // console.log(`case -1`)
          fragment.fragmentSellQty = buy.qtyLeft
          fragment.costBasis = fragment.fragmentSellQty * buy.unitCost
          fragment.proceeds = fragment.fragmentSellQty * sell.unitCost
          fragment.gainLoss = fragment.proceeds - fragment.costBasis
          sell.fragments.push(fragment)
          sell.qtyLeft = sell.qtyLeft - fragment.fragmentSellQty
          buy.qtyLeft = 0
          fragment.buyTxnFraction = fragment.fragmentSellQty / fragment.buyTxnTotalQty
          fragment.sellTxnFraction = fragment.fragmentSellQty / fragment.sellTxnTotalQty
          fragment.remainingSellQtyAfter = sell.qtyLeft
          sell.gainLoss += fragment.gainLoss
          break

        default:
          throw new Error("shouldn't be here")
      }
    }
  }
}

function inputRowToSaleTxn(input: InputRow): SellTransaction {
  const txn: SellTransaction = {
    id: input.id,
    exchange: input.exchange,
    asset: input.asset,
    date: moment(input.date).toDate(),
    saleQty: input.quantity,
    amt: input.amount,
    fragments: [],
    qtyLeft: input.quantity,
    unitCost: -1,
    gainLoss: 0,
  }
  return txn
}

function inputRowToBuyTxn(input: InputRow): BuyTransaction {
  const txn: BuyTransaction = {
    id: input.id,
    exchange: input.exchange,
    asset: input.asset,
    date: moment(input.date).toDate(),
    qtyBought: input.quantity,
    amt: input.amount,
    unitCost: -1,
    qtySold: 0,
    qtyLeft: input.quantity,
  }
  return txn
}

async function getInputs(): Promise<InputRow[]> {
  const dir = path.join(__dirname, config.inputFile)
  const content = fs.readFileSync(dir)
  const res = (await neatCsv(content)) as InputRow[]

  res.forEach((item) => {
    try {
      item.amount = parseFloat(item.amount as any)
      item.quantity = parseFloat(item.quantity as any)
    } catch (err) {
      console.log(`error parsing item ${item.amount}, ${item.quantity}!`)
    }
  })

  return res
}

calculateGains()
