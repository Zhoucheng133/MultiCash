import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import Database from "bun:sqlite";

interface CardRow {
  id: string;
  balance: number;
}

interface TransactionRow {
  id: string;
  card_id: string;
  type: number;
  amount: number;
  remark: string;
  status: number;
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
          UPDATE card SET balance = ? WHERE id = ?
        `).run(newBalance, body.card_id);

        return id;
      });

      const txId = runTransaction();
      return toRequestResponse(true, txId);

    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  edit(id: string, body: any): RequestResponse {
    if (!id) {
      return toRequestResponse(false, "No ID provided");
    }
    if (!body || Object.keys(body).length === 0) {
      return toRequestResponse(false, "No update fields provided");
    }

    const allowedFields = ["card_id", "type", "amount", "remark", "status"];
    const updates: string[] = [];
    const params: Record<string, any> = { $id: id };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "type") {
          const t = parseInt(body[field]);
          if (t !== 0 && t !== 1) {
            return toRequestResponse(false, "Invalid transaction type, must be 0 (income) or 1 (expense)");
          }
          params[`$${field}`] = t;
        } else if (field === "amount") {
          params[`$${field}`] = parseFloat(body[field]);
        } else if (field === "status") {
          params[`$${field}`] = parseInt(body[field]);
        } else {
          params[`$${field}`] = body[field];
        }
        updates.push(`${field} = $${field}`);
      }
    }

    if (updates.length === 0) {
      return toRequestResponse(false, "No valid fields to update");
    }

    const needBalanceUpdate = body.type !== undefined || body.amount !== undefined || body.card_id !== undefined;

    try {
      if (needBalanceUpdate) {
        const runTransaction = this.database.transaction(() => {
          const oldTx = this.database.prepare(`
            SELECT card_id, type, amount FROM transaction WHERE id = ? AND status = 1
          `).get(id) as TransactionRow | undefined;

          if (!oldTx) throw new Error("Transaction not found");

          const oldCard = this.database.prepare(`
            SELECT balance FROM card WHERE id = ? AND status = 1
          `).get(oldTx.card_id) as CardRow | undefined;

          if (!oldCard) throw new Error("Original card not found or disabled");

          const oldBalance = oldTx.type === 0
            ? oldCard.balance - oldTx.amount
            : oldCard.balance + oldTx.amount;

          this.database.prepare(`
            UPDATE card SET balance = ? WHERE id = ?
          `).run(oldBalance, oldTx.card_id);

          const newCardId = body.card_id ?? oldTx.card_id;
          const newType = body.type !== undefined ? parseInt(body.type) : oldTx.type;
          const newAmount = body.amount !== undefined ? parseFloat(body.amount) : oldTx.amount;

          const newCard = this.database.prepare(`
            SELECT balance FROM card WHERE id = ? AND status = 1
          `).get(newCardId) as CardRow | undefined;

          if (!newCard) throw new Error("Target card not found or disabled");

          if (newType === 1 && newCard.balance < newAmount) {
            throw new Error("Insufficient balance");
          }

          const newBalance = newType === 0
            ? newCard.balance + newAmount
            : newCard.balance - newAmount;

          this.database.prepare(`
            UPDATE card SET balance = ? WHERE id = ?
          `).run(newBalance, newCardId);

          const sql = `UPDATE transaction SET ${updates.join(", ")} WHERE id = $id`;
          this.database.prepare(sql).run(params);
        });

        runTransaction();
      } else {
        const sql = `UPDATE transaction SET ${updates.join(", ")} WHERE id = $id`;
        const result = this.database.prepare(sql).run(params);

        if (result.changes === 0) {
          return toRequestResponse(false, "Transaction not found");
        }
      }

      return toRequestResponse(true, "");
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}
