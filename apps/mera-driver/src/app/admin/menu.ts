import type { MenuNode } from '@skylabs-monorepo/shared-types';

/**
 * The console navigation is no longer a hardcoded, role-filtered list — it's
 * `authService.bootstrap()?.menu`, already pruned server-side to what the
 * signed-in user's permissions allow (see `Sidebar`). This file now only holds
 * small pure helpers over that `MenuNode[]` tree (flatten, breadcrumb lookup).
 *
 * Every route in this app that carries a menu node is nested under `/account`
 * (see `app.routes.ts`), while `MenuNode.route` itself is the app-agnostic path
 * from `@skylabs-monorepo/shared-menu` (e.g. `/drivers`) — `accountPath` bridges
 * the two.
 */

/** `/drivers` -> `/account/drivers`. Group nodes (no `route`) have no path of their own. */
export function accountPath(node: Pick<MenuNode, 'route'>): string | undefined {
  return node.route ? `/account${node.route}` : undefined;
}

export function flattenMenu(nodes: readonly MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenMenu(node.children) : [])]);
}

/** Finds the menu node whose account-prefixed route matches the current URL, for the breadcrumb. */
export function findMenuNodeByUrl(menu: readonly MenuNode[] | undefined, url: string): MenuNode | undefined {
  if (!menu) return undefined;
  const current=new URL(url,'http://menu.local');const nodes=flattenMenu(menu);return nodes.find(node=>{const path=accountPath(node);if(!path?.includes('?'))return false;const expected=new URL(path,'http://menu.local');return expected.pathname===current.pathname&&Array.from(expected.searchParams).every(([key,value])=>current.searchParams.get(key)===value);})??nodes.find(node=>accountPath(node)===current.pathname);
}

/** Preserve existing filtered workflow parameters when rendering sidebar links. */
export function accountQueryParams(node:Pick<MenuNode,'route'>):Record<string,string>{const params:Record<string,string>={};if(node.route)new URL(node.route,'http://menu.local').searchParams.forEach((value,key)=>params[key]=value);return params;}
