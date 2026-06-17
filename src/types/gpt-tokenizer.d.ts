declare module "gpt-tokenizer/esm/encoding/cl100k_base" {
  export function encode(text: string): number[];
  export function decode(tokens: number[]): string;
  export function countTokens(text: string): number;
  const api: {
    encode: typeof encode;
    decode: typeof decode;
    countTokens: typeof countTokens;
  };
  export default api;
}
