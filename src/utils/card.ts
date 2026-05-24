import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import { lookupBin } from "card-bin-db";
import Database from "bun:sqlite";
import dayjs from "dayjs";

export class Card{

  private database: Database;

  initCardTable(){
    this.database.prepare(`
      CREATE TABLE IF NOT EXISTS card (
        id TEXT PRIMARY KEY,
        bin TEXT,
        bin_suffix TEXT,
        name TEXT,
        bank_name TEXT,
        bank_code TEXT,
        card_type TEXT,
        status INTEGER DEFAULT 1,
        balance REAL DEFAULT 0.00,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `).run()
  }

  constructor(db: Database){
    this.database=db;
    this.initCardTable();
  }
  
  async cardBinCheck(bin: string | undefined): Promise<RequestResponse>{
    if (bin) {
      const info=await lookupBin(bin);
      return toRequestResponse(true, info)
    }else{
      return toRequestResponse(false, "请提供有效的BIN码")
    }
  }

  add(body: any): RequestResponse{
    if(!body || !body.bin || !body.name || !body.bank_name || !body.bank_code || !body.card_type){
      return toRequestResponse(false, "参数错误")
    }

    const id=nanoid();
    const initialBalance = body.balance ? parseFloat(body.balance) : 0.00;

    try {
      this.database.prepare(`
        INSERT INTO card (id, bin, bin_suffix, name, bank_name, bank_code, card_type, status, balance, created_at, updated_at)
        VALUES ($id, $bin, $bin_suffix, $name, $bank_name, $bank_code, $card_type, $status, $balance, $created_at, $updated_at)
      `).run({
        $id: id,
        $bin: body.bin,
        $name: body.name,
        $bank_name: body.bank_name,
        $bank_code: body.bank_code,
        $card_type: body.card_type,
        $status: body.status ?? 1,
        $balance: initialBalance,
        $bin_suffix: body.bin.slice(-4),
        $created_at: dayjs().unix(),
        $updated_at: dayjs().unix(),
      });
      return toRequestResponse(true, id);
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  remove(id: string | undefined): RequestResponse {
    if(!id){
      return toRequestResponse(false, "未提供ID");
    }
    try {
      this.database.prepare(`
        UPDATE card SET status = 0 WHERE id = $id
      `).run({
        $id: id
      });
      
      return toRequestResponse(true, "");
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  edit(id: string, body: any): RequestResponse {
    if(!id){
      return toRequestResponse(false, "未提供ID");
    }
    if(!body || Object.keys(body).length === 0){
      return toRequestResponse(false, "未提供更新字段");
    }

    const allowedFields = ["bin", "name", "bank_name", "bank_code", "card_type", "status", "balance"];
    const updates: string[] = [];
    const params: Record<string, any> = { $id: id };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${field}`);
        if (field === "balance") {
          params[`$${field}`] = parseFloat(body[field]);
        } else if (field === "status") {
          params[`$${field}`] = parseInt(body[field]);
        } else {
          params[`$${field}`] = body[field];
        }
      }
    }

    if (updates.length === 0) {
      return toRequestResponse(false, "没有有效的更新字段");
    }

    if (body.bin !== undefined) {
      updates.push("bin_suffix = $bin_suffix");
      params["$bin_suffix"] = body.bin.slice(-4);
    }

    updates.push("updated_at = $updated_at");
    params["$updated_at"] = dayjs().unix();

    try {
      const sql = `UPDATE card SET ${updates.join(", ")} WHERE id = $id`;
      const result = this.database.prepare(sql).run(params);

      if (result.changes === 0) {
        return toRequestResponse(false, "卡片不存在");
      }

      return toRequestResponse(true, "");
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  list(): RequestResponse {
    try {
      const cards = this.database.prepare(`
        SELECT id, bin_suffix, name, bank_name, bank_code, card_type, status, balance, created_at, updated_at 
        FROM card 
        ORDER BY created_at DESC
      `).all();
      
      return toRequestResponse(true, cards);
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }

  info(id: string): RequestResponse{
    if(!id){
      return toRequestResponse(false, "未提供ID");
    }
    try {
      const card = this.database.prepare(`
        SELECT bin 
        FROM card 
        WHERE id = $id
      `).get({
        $id: id
      });
      
      return toRequestResponse(true, card);
    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}