import { md5 } from '@noble/hashes/legacy';
import { bytesToHex } from '@noble/hashes/utils';
import type { WbiKeys } from './types.js';

export const BILI_API = 'https://api.bilibili.com';
export const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
export const BILI_HEADERS: Record<string, string> = {
  'User-Agent': BILI_UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
  41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

/** 生成 WBI 签名所需的 mixin key（img_key + sub_key 按重排表取前 32 位）。 */
export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join('');
}

/**
 * 为请求参数附加 wts 与 w_rid 签名，返回可直接拼入 URL 的 query。
 * 规则：过滤空值与签名键，参数按 key 升序，值过滤 !'()* 后 encodeURIComponent，
 * MD5(query + mixin_key) 取前 32 位。
 */
export function signWbiQuery(params: Record<string, string>, keys: WbiKeys): string {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'w_rid' && key !== 'wts') filtered[key] = value.replace(/[!'()*]/g, '');
  }
  filtered.wts = String(Math.floor(Date.now() / 1000));
  const query = Object.keys(filtered)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(filtered[key]!)}`)
    .join('&');
  const wRid = bytesToHex(md5(query + getMixinKey(keys.imgKey, keys.subKey))).slice(0, 32);
  return `${query}&w_rid=${wRid}`;
}

export interface NavResponse {
  code: number;
  message?: string;
  data?: {
    isLogin?: boolean;
    wbi_img?: { img_url: string; sub_url: string };
  };
}

export interface FeedSpaceStat {
  comment: { count: number };
  like: { count: number };
  forward: { count: number };
}

export interface FeedSpaceItem {
  id_str: string;
  type: string;
  modules: {
    module_stat: FeedSpaceStat;
    module_dynamic?: {
      desc?: { text?: string };
      major?: {
        opus?: { title?: string; summary?: { text?: string } };
        archive?: { title?: string; desc?: string };
        article?: { title?: string };
        draw?: unknown;
        common?: { title?: string };
        live?: { title?: string; desc?: { text?: string } };
      } & Record<string, unknown>;
    };
  };
}

export interface FeedSpaceResponse {
  code: number;
  message?: string;
  data?: { items?: FeedSpaceItem[]; has_more: boolean };
}
