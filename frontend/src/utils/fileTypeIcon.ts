import { ComponentType, SVGProps } from 'react';
import {
  TypescriptOriginal,
  JavascriptOriginal,
  PythonOriginal,
  RustOriginal,
  GoOriginal,
  JavaOriginal,
  COriginal,
  CplusplusOriginal,
  CsharpOriginal,
  SwiftOriginal,
  KotlinOriginal,
  DartOriginal,
  RubyOriginal,
  PhpOriginal,
  LuaOriginal,
  ROriginal,
  ScalaOriginal,
  ElixirOriginal,
  Html5Original,
  Css3Original,
  SassOriginal,
  JsonOriginal,
  MarkdownOriginal,
  YamlOriginal,
  BashOriginal,
  PowershellOriginal,
  ReactOriginal,
  VuejsOriginal,
  SvelteOriginal,
  AngularOriginal,
  DockerOriginal,
  PostgresqlOriginal,
  GraphqlPlain,
} from 'devicons-react';
import { File } from '@phosphor-icons/react';

type IconComponent = ComponentType<
  SVGProps<SVGElement> & { size?: number | string }
>;

const extToIcon: Record<string, IconComponent> = {
  // TypeScript/JavaScript
  ts: TypescriptOriginal,
  tsx: TypescriptOriginal,
  js: JavascriptOriginal,
  mjs: JavascriptOriginal,
  cjs: JavascriptOriginal,
  jsx: ReactOriginal,

  // Web
  html: Html5Original,
  htm: Html5Original,
  css: Css3Original,
  scss: SassOriginal,
  sass: SassOriginal,
  less: Css3Original,

  // Frameworks
  vue: VuejsOriginal,
  svelte: SvelteOriginal,

  // Languages
  py: PythonOriginal,
  rs: RustOriginal,
  go: GoOriginal,
  java: JavaOriginal,
  c: COriginal,
  h: COriginal,
  cpp: CplusplusOriginal,
  cc: CplusplusOriginal,
  cxx: CplusplusOriginal,
  hpp: CplusplusOriginal,
  cs: CsharpOriginal,
  swift: SwiftOriginal,
  kt: KotlinOriginal,
  dart: DartOriginal,
  rb: RubyOriginal,
  php: PhpOriginal,
  lua: LuaOriginal,
  r: ROriginal,
  scala: ScalaOriginal,
  ex: ElixirOriginal,
  exs: ElixirOriginal,

  // Data/Config
  json: JsonOriginal,
  md: MarkdownOriginal,
  yaml: YamlOriginal,
  yml: YamlOriginal,

  // Shell
  sh: BashOriginal,
  bash: BashOriginal,
  zsh: BashOriginal,
  ps1: PowershellOriginal,

  // Databases
  sql: PostgresqlOriginal,
  psql: PostgresqlOriginal,

  // Special files
  graphql: GraphqlPlain,
  gql: GraphqlPlain,
};

// Special filename mappings (for files without extensions)
const filenameToIcon: Record<string, IconComponent> = {
  dockerfile: DockerOriginal,
  'docker-compose.yml': DockerOriginal,
  'docker-compose.yaml': DockerOriginal,
  '.angular.json': AngularOriginal,
};

export function getFileIcon(filename: string): IconComponent {
  const lowerFilename = filename.toLowerCase();

  // Check special filenames first
  const basename = lowerFilename.split('/').pop() || '';
  if (filenameToIcon[basename]) {
    return filenameToIcon[basename];
  }

  // Then check extension
  const ext = basename.split('.').pop() || '';
  return extToIcon[ext] || File;
}
