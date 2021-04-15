# Raw Txn Capital Gains Calculator

A capital gains calculator designed to minimize capital gains by selling highest unit cost buy transactions first.

## input schema

Put a .csv file with the following row schemas (include a header row) into `./input/input.csv`

```ts
interface InputRow {
  id: string
  exchange: string
  action: "Buy" | "Sell"
  date: string
  asset: string
  quantity: number
  amount: number
}
```

## Install dependencies and run

```sh
npm i
npm start
```

## output

An excel spreadsheet report will be output at ./output/report.xlsx.  The spreadsheet contains four sheets:

1. Inputs - the original input rows
2. Sell Txns - all sell txns processed, along with 
3. Buy Txns - all buy transactions, both sold and not sold, along with quantity remaining
4. Sell Fragments - the individual sells broken up by which sell transaction, which buy transaction, quantity sold for that fragment, and associated capital gain or loss.
