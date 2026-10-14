import { onRequestGet as __api_auth_js_onRequestGet } from "E:\\deepseek\\yukki-rui\\functions\\api\\auth.js"
import { onRequestGet as __api_callback_js_onRequestGet } from "E:\\deepseek\\yukki-rui\\functions\\api\\callback.js"

export const routes = [
    {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_js_onRequestGet],
    },
  {
      routePath: "/api/callback",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_callback_js_onRequestGet],
    },
  ]