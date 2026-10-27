/** Styles of the OpenAPI preview: Swagger UI's palette and layout, light, no scripts. Added to BASE_CSS by markup.ts. */
export const OPENAPI_CSS = `
  .oas { color: #3b4151; font-family: -apple-system, system-ui, "Segoe UI", sans-serif; }
  .oas h1 { font-size: 30px; line-height: 1.2; margin: 6px 0 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .pill { font: 700 12px/1 -apple-system, system-ui, sans-serif; padding: 4px 7px; border-radius: 12px; background: #7d8492; color: #fff; }
  .pill.oas { background: #89bf04; }
  .oas .desc { white-space: pre-wrap; margin: 0 0 12px; font-size: 14px; }
  .servers { margin: 14px 0 6px; }
  .servers .lbl { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
  .srv { display: inline-block; margin-right: 8px; padding: 6px 12px; background: #fff; border: 1px solid #d9d9d9; border-radius: 4px; font: 13px ui-monospace, Menlo, monospace; box-shadow: 0 1px 2px rgba(0,0,0,.1); }

  .oas h2.tag { display: flex; align-items: baseline; gap: 14px; margin: 26px 0 10px; padding: 0 4px 6px; font-size: 22px; font-weight: 600; border-bottom: 1px solid rgba(59,65,81,.3); }
  .tag small { font-size: 13px; font-weight: 400; color: #6b6b6b; }

  /* An operation is coloured by its method, as in Swagger UI. */
  .op { --c: 97, 175, 254; margin: 0 0 12px; border: 1px solid rgb(var(--c)); border-radius: 4px; background: rgba(var(--c), .1); box-shadow: 0 0 3px rgba(0,0,0,.19); }
  .m-post { --c: 73, 204, 144; } .m-put { --c: 252, 161, 48; } .m-delete { --c: 249, 62, 62; } .m-patch { --c: 80, 227, 194; }
  .m-head { --c: 144, 18, 254; } .m-options { --c: 13, 90, 167; } .m-trace { --c: 110, 119, 129; }
  .op.deprecated { --c: 160, 160, 160; opacity: .6; }
  .op.deprecated .path { text-decoration: line-through; }
  .op summary { display: flex; align-items: center; gap: 12px; padding: 5px; cursor: pointer; list-style: none; }
  .op summary::-webkit-details-marker { display: none; }
  .op summary::after { content: ""; flex: none; order: 9; width: 7px; height: 7px; margin: 0 12px 3px 4px; border: solid #3b4151; border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .op[open] summary::after { transform: rotate(-135deg); margin-bottom: -3px; }
  .op[open] summary { border-bottom: 1px solid rgb(var(--c)); }
  .method { flex: none; min-width: 72px; padding: 6px 0; text-align: center; border-radius: 3px; background: rgb(var(--c)); color: #fff; font-size: 14px; font-weight: 700; text-shadow: 0 1px 0 rgba(0,0,0,.1); }
  .path { font: 600 15px ui-monospace, Menlo, monospace; word-break: break-all; }
  .op em { font-style: normal; font-size: 12px; font-weight: 700; color: #6b6b6b; }
  .op .sum { flex: 1; text-align: right; font-size: 13px; }
  .op-body { padding: 0 20px 14px; background: rgba(255,255,255,.7); }
  .opdesc { margin: 12px 0 0; font-size: 14px; white-space: pre-wrap; }

  .sec-head { display: flex; align-items: center; justify-content: space-between; margin: 14px -20px 0; padding: 8px 20px; background: rgba(255,255,255,.8); box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  .sec-head h4 { margin: 0; font-size: 14px; font-weight: 700; }
  .sec-body { padding-top: 10px; }
  .reqtext { color: #f93e3e; font-size: 12px; font-weight: 600; }
  .req { color: #f93e3e; margin-left: 2px; }

  table.grid { width: 100%; margin: 0; border: 0; border-collapse: collapse; }
  .grid th { padding: 12px 0; border: 0; border-bottom: 1px solid rgba(59,65,81,.2); font-size: 12px; font-weight: 700; text-align: left; }
  .grid td { padding: 10px 0; border: 0; border-bottom: 1px solid rgba(59,65,81,.1); }
  .grid td p { margin: 0 0 6px; font-size: 14px; }
  .grid td.pn { width: 28%; padding-right: 12px; }
  .grid td.rc { width: 70px; font-weight: 700; font-size: 14px; }
  .pname { font-size: 14px; font-weight: 700; word-break: break-word; }
  .ptype { font: 12px ui-monospace, Menlo, monospace; color: #3b4151; }
  .pin { font-size: 12px; font-style: italic; color: #6b6b6b; }

  .mime { display: inline-block; margin: 0 0 8px; padding: 4px 10px; border: 1px solid #d9d9d9; border-radius: 4px; background: #f7f7f7; font: 12px ui-monospace, Menlo, monospace; }
  .tabs > input { display: none; }
  .tabs > label { display: inline-block; margin-right: 18px; padding: 6px 2px; border-bottom: 2px solid transparent; font-size: 12px; font-weight: 700; opacity: .55; cursor: pointer; }
  .tabs > .pane { display: none; margin-top: -1px; padding-top: 10px; border-top: 1px solid rgba(59,65,81,.2); }
  .tabs > input:nth-of-type(1):checked ~ label:nth-of-type(1), .tabs > input:nth-of-type(2):checked ~ label:nth-of-type(2) { opacity: 1; border-bottom-color: #3b4151; }
  .tabs > input:nth-of-type(1):checked ~ div:nth-of-type(1), .tabs > input:nth-of-type(2):checked ~ div:nth-of-type(2) { display: block; }
  pre.example { margin: 0; padding: 14px; border-radius: 4px; background: #41444e; color: #fff; font: 12px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }

  .model { font-size: 12px; }
  .model.nested { margin-top: 4px; }
  .mname { font-size: 13px; font-weight: 700; }
  .br { color: #6b6b6b; }
  table.mt { margin: 2px 0 2px 18px; border: 0; border-collapse: collapse; }
  .mt td { padding: 3px 10px 3px 0; border: 0; vertical-align: top; }
  .mt td.mp { font-size: 12px; font-weight: 600; white-space: nowrap; color: #3b4151; }
  .mtype { color: #55a; font-family: ui-monospace, Menlo, monospace; }
  .mdesc { color: #6b6b6b; }
  .facts { color: #6b6b6b; font-size: 11px; }
  .facts code { font-size: 11px; background: #f0f0f0; }

  .sch { margin: 0 0 8px; border: 1px solid rgba(59,65,81,.2); border-radius: 4px; background: #fff; }
  .sch summary { padding: 8px 14px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .sch-body { padding: 4px 14px 12px; }
`;
