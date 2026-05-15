import { Elysia } from "elysia";
import { Card } from "./utils/card";
import { User } from "./utils/user";
import Database from "bun:sqlite";
import { Auth } from "./utils/auth";
import { Transaction } from "./utils/transaction";
import { toRequestResponse } from "./utils/types";

const db = new Database('db/database.db');

const auth=new Auth();
const user=new User(db);
const card=new Card(db);
const transaction=new Transaction(db);

const app = new Elysia()

.group("/api", (app)=>{
  app.group("/card", (app)=>{
    app.get("/bincheck", ({ query })=>card.cardBinCheck(query.bin));

    return app;
  })
  
  app.group("/user", (app)=>{
    app.post("/login", ({ body, cookie })=>user.login(body, cookie));
    app.post("/register", ({ body })=>user.register(body));
    app.get("/nouser", ()=>user.nouser());

    return app;
  })

  app.group("/auth", (app)=>{
    app.get("/refresh", ({ cookie })=>auth.refresh(cookie));
    return app;
  })

  .guard({
    beforeHandle({ headers, set }){
      const response=auth.jwtCheck(headers);
      if(response.ok===false){
        set.status = 401;
        return response;
      }
    }
  }, (app)=>{
    app.group("/card", (app)=>{
      app.post("/add", ({ body })=>card.add(body));
      app.delete("/del", ({ query })=>card.remove(query.id))
      app.post("/edit", ({ query, body })=>card.edit(query.id, body))
      return app;
    })

    app.group("/transaction", (app)=>{
      app.post("/add", ({ body })=>transaction.add(body));
      app.post("/edit", ({ query, body })=>transaction.edit(query.id, body));
      app.delete("/del", ({ query })=>transaction.remove(query.id));
      return app;
    })

    return app;
  })

  return app;
}).listen(3000);

console.log(`🦊 Elysia is running at http://127.0.0.1:${app.server?.port}`);
