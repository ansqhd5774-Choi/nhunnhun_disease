const EXPECTED_REPO='ansqhd5774-Choi/nhunnhun_disease';
const PATH='publishing/update-state';

export class UpdateLedger {
  constructor(env=process.env){
    if(env.GITHUB_REPOSITORY!==EXPECTED_REPO || !env.GITHUB_TOKEN) throw new Error('E_GITHUB_CONFIGURATION');
    this.token=env.GITHUB_TOKEN;
  }
  async request(id,method='GET',body){
    if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw new Error('E_UPDATE_LEDGER_ID');
    const url=`https://api.github.com/repos/${EXPECTED_REPO}/contents/${PATH}/${id}.json${method==='GET'?'?ref=main':''}`;
    const response=await fetch(url,{
      method,
      headers:{Authorization:`Bearer ${this.token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(20000)
    });
    if(method==='GET'&&response.status===404) return null;
    if(!response.ok) throw new Error('E_UPDATE_LEDGER_REQUEST');
    return response.json();
  }
  async read(id){
    const data=await this.request(id);
    if(!data) return null;
    return {...JSON.parse(Buffer.from(data.content,'base64').toString('utf8')),sha:data.sha};
  }
  async write(id,record,previousSha){
    return this.request(id,'PUT',{
      message:`update checkpoint: ${id}`,
      branch:'main',
      content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64'),
      ...(previousSha?{sha:previousSha}:{})
    });
  }
}
