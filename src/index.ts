import { Elysia, file } from "elysia";
import { Card } from "./utils/card";
import { User } from "./utils/user";
import Database from "bun:sqlite";
import { Auth } from "./utils/auth";
import { Record } from "./utils/record";
import staticPlugin from "@elysia/static";

const db = new Database('db/database.db');

const auth=new Auth();
const user=new User(db);
const card=new Card(db);
const record=new Record(db);

const app = new Elysia()

.use(staticPlugin({
  prefix: "/",
  alwaysStatic: true,
  assets: "frontend/dist"
}))

.group("/api", (app)=>{
  
  app.group("/user", (app)=>{
    app.post("/login", ({ body, cookie })=>user.login(body, cookie));
    app.post("/register", ({ body })=>user.register(body));
    app.post("/logout", ({ cookie })=>user.logout(cookie));
    app.post("/changepwd", ({ body, headers })=>user.changePwd(body, headers));
    app.get("/nouser", ()=>user.nouser());

    return app;
  })

  app.group("/auth", (app)=>{
    app.get("/refresh", ({ cookie })=>auth.refresh(cookie));
    app.get("/check", ({ headers })=>auth.jwtCheck(headers));
    return app;
  })

  .guard({
    beforeHandle({ headers }){
      const response=auth.jwtCheck(headers);
      if(response.ok===false){
        return response;
      }
    }
  }, (app)=>{
    app.group("/card", (app)=>{
      app.get("/bincheck", ({ query })=>card.cardBinCheck(query.bin));
      app.get("/list", ()=>card.list());
      app.post("/add", ({ body })=>card.add(body));
      app.delete("/del", ({ query })=>card.remove(query.id));
      app.post("/edit", ({ query, body })=>card.edit(query.id, body));
      app.get("/info", ({ query })=>card.info(query.id));
      return app;
    })

    app.group("/record", (app)=>{
      app.get("/list", ({ query })=>record.list(query));
      app.post("/add", ({ body })=>record.add(body));
      app.post("/edit", ({ query, body })=>record.edit(query.id, body));
      app.delete("/del", ({ query })=>record.remove(query.id));
      return app;
    })

    return app;
  })

  return app;
})

.get("/*", ()=>file("frontend/dist/index.html"))

.listen(3000);

console.log(`🦊 Elysia is running at http://127.0.0.1:${app.server?.port}`);
