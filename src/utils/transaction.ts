import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import Database from "bun:sqlite";

interface CardRow {
  id: string;
  balance: number;
}

export class Transaction{

  private database: Database;

  initTransactionTable(){
    // 注意type: 0表示入账，1表示出账
    this.database.prepare(`
      CREATE TABLE IF NOT EXISTS transaction (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        type INTEGER NOT NULL,
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

    const type = parseInt(body.type);
    if(type !== 0 && type !== 1){
      return toRequestResponse(false, "Invalid transaction type, must be 0 (income) or 1 (expense)")
    }

    const id = nanoid();
    const amount = parseFloat(body.amount);

    try {
      const runTransaction = this.database.transaction(() => {
        const card = this.database.prepare(`
          SELECT balance FROM card WHERE id = ? AND status = 1
        `).get(body.card_id) as CardRow | undefined;

        if (!card) throw new Error("Card not found or disabled");

        if (type === 1 && card.balance < amount) {
          throw new Error("Insufficient balance");
        }

        const newBalance = type === 0 ? card.balance + amount : card.balance - amount;

        this.database.prepare(`
          INSERT INTO transaction (id, card_id, type, amount, remark, status)
          VALUES ($id, $card_id, $type, $amount, $remark, $status)
        `).run({
          $id: id,
          $card_id: body.card_id,
          $type: type,
          $amount: amount,
          $remark: body.remark ?? "",
          $status: body.status ?? 1
        });

        this.database.prepare(`
          UPDATE card SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(newBalance, body.card_id);

        return id;
      });

      const txId = runTransaction();
      return toRequestResponse(true, txId);

    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}
