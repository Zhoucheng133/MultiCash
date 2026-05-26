import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import Database from "bun:sqlite";
import dayjs from "dayjs";

interface CardRow {
  id: string;
  balance: number;
}

interface RecordRow {
  id: string;
  card_id: string;
  type: number;
  amount: number;
  remark: string;
  status: number;
}

export class Record {

  private database: Database;

  initRecordTable(){
    // 注意type: 0表示入账，1表示出账
    this.database.prepare(`
      CREATE TABLE IF NOT EXISTS record (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        type INTEGER NOT NULL,
        amount REAL NOT NULL,
        remark TEXT,
        status INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (card_id) REFERENCES card(id)
      )
    `).run()
  }

  constructor(db: Database){
    this.database=db;
    this.initRecordTable();
  }

  // 添加账单
  add(body: any): RequestResponse{
    if(!body || !body.card_id || body.type==undefined || body.type==null || !body.amount){
      return toRequestResponse(false, "参数错误")
    }

    const type = parseInt(body.type);
    if(type !== 0 && type !== 1){
      return toRequestResponse(false, "无效的记录类型，必须是 0（入账）或 1（出账）")
    }

    const id = nanoid();
    const amount = parseFloat(body.amount);

    try {
      const runRecord = this.database.transaction(() => {
        const card = this.database.prepare(`
          SELECT balance FROM card WHERE id = $card_id AND status = 1
        `).get({
          $card_id: body.card_id 
        }) as CardRow | undefined;

        if (!card) throw new Error("卡片不存在或已禁用");

        if (type === 1 && card.balance < amount) {
          throw new Error("余额不足");
        }

        const newBalance = type === 0 ? card.balance + amount : card.balance - amount;

        this.database.prepare(`
          INSERT INTO record (id, card_id, type, amount, remark, status, created_at, updated_at)
          VALUES ($id, $card_id, $type, $amount, $remark, $status, $created_at, $updated_at)
        `).run({
          $id: id,
          $card_id: body.card_id,
          $type: type,
          $amount: amount,
          $remark: body.remark ?? "",
          $status: body.status ?? 1,
          $created_at: dayjs().unix(),
          $updated_at: dayjs().unix(),
        });

        this.database.prepare(`
          UPDATE card SET balance = $balance WHERE id = $card_id
        `).run({
          $balance: newBalance,
          $card_id: body.card_id
        });

        return id;
      });

      const txId = runRecord();
      return toRequestResponse(true, txId);

    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  // 编辑账单
  edit(id: string, body: any): RequestResponse {
    if (!id) {
      return toRequestResponse(false, "未提供ID");
    }
    if (!body || Object.keys(body).length === 0) {
      return toRequestResponse(false, "未提供更新字段");
    }

    const allowedFields = ["card_id", "type", "amount", "remark", "status"];
    const updates: string[] = [];
    const params: { [key: string]: any } = { $id: id };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "type") {
          const t = parseInt(body[field]);
          if (t !== 0 && t !== 1) {
            return toRequestResponse(false, "无效的记录类型，必须是 0（入账）或 1（出账）");
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
      return toRequestResponse(false, "没有有效的更新字段");
    }

    updates.push(`updated_at = ${dayjs().unix()}`);

    const needBalanceUpdate = body.type !== undefined || body.amount !== undefined || body.card_id !== undefined;

    try {
      if (needBalanceUpdate) {
        const runRecord = this.database.transaction(() => {
          const oldTx = this.database.prepare(`
            SELECT card_id, type, amount FROM record WHERE id = $id AND status = 1
          `).get({
            $id: id
          }) as RecordRow | undefined;

          if (!oldTx) throw new Error("记录不存在");

          const oldCard = this.database.prepare(`
            SELECT balance FROM card WHERE id = $card_id AND status = 1
          `).get({
            $card_id: oldTx.card_id
          }) as CardRow | undefined;

          if (!oldCard) throw new Error("原卡片不存在或已禁用");

          const oldBalance = oldTx.type === 0
            ? oldCard.balance - oldTx.amount
            : oldCard.balance + oldTx.amount;

          this.database.prepare(`
            UPDATE card SET balance = $balance WHERE id = $card_id
          `).run({
            $balance: oldBalance, $card_id: oldTx.card_id
          });

          const newCardId = body.card_id ?? oldTx.card_id;
          const newType = body.type !== undefined ? parseInt(body.type) : oldTx.type;
          const newAmount = body.amount !== undefined ? parseFloat(body.amount) : oldTx.amount;

          const newCard = this.database.prepare(`
            SELECT balance FROM card WHERE id = $card_id AND status = 1
          `).get({
            $card_id: newCardId
          }) as CardRow | undefined;

          if (!newCard) throw new Error("目标卡片不存在或已禁用");

          if (newType === 1 && newCard.balance < newAmount) {
            throw new Error("余额不足");
          }

          const newBalance = newType === 0
            ? newCard.balance + newAmount
            : newCard.balance - newAmount;

          this.database.prepare(`
            UPDATE card SET balance = $balance WHERE id = $card_id
          `).run({
            $balance: newBalance, $card_id: newCardId
          });

          const sql = `UPDATE record SET ${updates.join(", ")} WHERE id = $id`;
          this.database.prepare(sql).run(params);
        });

        runRecord();
      } else {
        const sql = `UPDATE record SET ${updates.join(", ")} WHERE id = $id`;
        const result = this.database.prepare(sql).run(params);

        if (result.changes === 0) {
          return toRequestResponse(false, "记录不存在");
        }
      }

      return toRequestResponse(true, "");
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  // 删除账单
  remove(id: string | undefined): RequestResponse {
    if (!id) {
      return toRequestResponse(false, "未提供ID");
    }

    try {
      const runRecord = this.database.transaction(() => {
        const tx = this.database.prepare(`
          SELECT card_id, type, amount FROM record WHERE id = $id AND status = 1
        `).get({
          $id: id
        }) as RecordRow | undefined;

        if (!tx) throw new Error("记录不存在");

        const card = this.database.prepare(`
          SELECT balance FROM card WHERE id = $card_id AND status = 1
        `).get({
          $card_id: tx.card_id
        }) as CardRow | undefined;

        if (!card) throw new Error("卡片不存在或已禁用");

        const newBalance = tx.type === 0
          ? card.balance - tx.amount
          : card.balance + tx.amount;

        if (newBalance < 0) {
          throw new Error("删除失败：余额不足以扣减（将导致卡片余额为负）");
        }

        this.database.prepare(`
          UPDATE card SET balance = $balance WHERE id = $card_id
        `).run({
          $balance: newBalance, $card_id: tx.card_id
        });

        this.database.prepare(`
          UPDATE record SET status = 0 WHERE id = $id
        `).run({
          $id: id
        });
      });

      runRecord();
      return toRequestResponse(true, "");
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  list(query: any): RequestResponse {
    try {
      let sql = `
        SELECT r.id, r.card_id, r.type, r.amount, r.remark, r.status, r.created_at,
          c.name as card_name, c.bin_suffix
        FROM record r
        LEFT JOIN card c ON r.card_id = c.id
        WHERE 1=1
      `;
      
      const params: { [key: string]: any } = {};
      
      if (query.card_id && query.card_id !== "") {
        sql += ` AND r.card_id = $card_id`;
        params.$card_id = query.card_id;
      }
      
      if (query.type !== undefined && query.type !== null && query.type !== "") {
        sql += ` AND r.type = $type`;
        params.$type = parseInt(query.type, 10);
      }
      
      if (query.remark && query.remark !== "") {
        sql += ` AND r.remark LIKE $remark`;
        params.$remark = `%${query.remark}%`;
      }
      
      if (query.amount !== undefined && query.amount !== null && query.amount !== "") {
        const amountValue = parseFloat(query.amount);
        
        if (!isNaN(amountValue)) {
          if (query.amount_compare === "gt") {
            sql += ` AND r.amount > $amount`;
          } else if (query.amount_compare === "lt") {
            sql += ` AND r.amount < $amount`;
          } else {
            sql += ` AND r.amount = $amount`;
          }
          params.$amount = amountValue;
        }
      }
      
      if (query.created_at && query.created_at !== "") {
        const dateValue = query.created_at;
        if (query.created_at_compare === "gt") {
          sql += ` AND r.created_at > $created_at`;
        } else if (query.created_at_compare === "lt") {
          sql += ` AND r.created_at < $created_at`;
        } else {
          sql += ` AND r.created_at = $created_at`;
        }
        params.$created_at = dateValue;
      }

      if(query.status !== undefined && query.status !== null && query.status !== ""){
        sql += ` AND r.status = $status`;
      }
      
      sql += ` ORDER BY r.created_at DESC`;
      
      const records = this.database.prepare(sql).all(params);
      
      return toRequestResponse(true, records);
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}
