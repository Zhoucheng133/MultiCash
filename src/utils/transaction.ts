import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import Database from "bun:sqlite";

export class Transaction{

  private database: Database;

  initTransactionTable(){
    this.database.prepare(`
      CREATE TABLE IF NOT EXISTS transaction (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        remark TEXT,
        status INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (card_id) REFERENCES card(id)
      )
    `).run()
  }

  constructor(db: Database){
    this.database=db;
    this.initTransactionTable();
  }

  add(body: any): RequestResponse{
    if(!body || !body.card_id || !body.type || !body.amount){
      return toRequestResponse(false, "Incorrect parameters")
    }

    const validTypes = ["income", "expense", "transfer"];
    if(!validTypes.includes(body.type)){
      return toRequestResponse(false, "Invalid transaction type, must be one of: income, expense, transfer")
    }

    const id = nanoid();

    try {
      this.database.prepare(`
        INSERT INTO transaction (id, card_id, type, amount, remark, status)
        VALUES ($id, $card_id, $type, $amount, $remark, $status)
      `).run({
        $id: id,
        $card_id: body.card_id,
        $type: body.type,
        $amount: parseFloat(body.amount),
        $remark: body.remark ?? "",
        $status: body.status ?? 1,
      });
      return toRequestResponse(true, id);
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}
