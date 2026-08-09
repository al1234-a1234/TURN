import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // سكربتات k6 تعمل خارج المشروع بمفسّرها الخاص، وتصديرُها الافتراضي
    // المجهول هو عقدها لا خطأً فيها — فتُستثنى بدل أن تُكتم بتعليقٍ في كلٍّ.
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "scripts/*.k6.js"],
  },
];

export default eslintConfig;
