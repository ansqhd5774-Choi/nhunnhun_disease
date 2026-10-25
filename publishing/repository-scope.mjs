import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const REPOSITORY_SCOPE = Object.freeze(JSON.parse(readFileSync(new URL('../repository-scope.json', import.meta.url),'utf8')));
export function assertRepositorySource(source, env=process.env) {
  if (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY !== REPOSITORY_SCOPE.repository) throw Error('E_REPOSITORY_SCOPE');
  if (!source || source.category !== REPOSITORY_SCOPE.category) throw Error('E_CATEGORY_SCOPE');
  if (!/^direct-[a-z0-9-]{2,70}$/.test(source.id ?? '') || source.contentStandard !== 'SP1') throw Error('E_DIRECT_SCOPE');
  return source;
}
export function assertSelectedSource(kind,id,env=process.env) {
  if (!['posts','updates'].includes(kind) || !/^direct-[a-z0-9-]{2,70}$/.test(id ?? '')) throw Error('E_SELECTED_SOURCE_REQUIRED');
  return assertRepositorySource(JSON.parse(readFileSync(fileURLToPath(new URL(`../${kind}/${id}.json`,import.meta.url)),'utf8')),env);
}
