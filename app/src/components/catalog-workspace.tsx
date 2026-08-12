"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, Code2, Download, FileJson, Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogTestButton } from "@/components/catalog-test-button";

export type CatalogVersion = { version: number; schema: Record<string, unknown>; example: unknown; compatibilityMode: "backward" | "none"; compatibilityWarnings: string[]; status: string; publishedAt: string };
export type CatalogContract = { id: string; name: string; description: string | null; versions: CatalogVersion[] };
type Application = { id: string; name: string; uid: string; description: string | null };
type Language = "curl" | "typescript" | "python";

export function CatalogWorkspace({ application, contracts, siteUrl }: { application: Application; contracts: CatalogContract[]; siteUrl: string }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => { const query=search.trim().toLowerCase(); return query?contracts.filter((contract)=>`${contract.name} ${contract.description||""}`.toLowerCase().includes(query)):contracts; },[contracts,search]);
  return <main className="catalog-shell"><header className="catalog-nav"><Brand/><span>Generated event catalog</span></header><section className="catalog-hero"><span>APPLICATION CONTRACTS</span><h1>{application.name}</h1><p>{application.description||"Versioned webhook events, payload schemas, and integration examples."}</p><code>{application.uid}</code></section><div className="catalog-layout"><aside><strong>Events <small>{filtered.length}</small></strong><label className="catalog-search"><Search size={15}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search events" aria-label="Search event contracts"/></label><nav>{filtered.map((contract)=><a key={contract.id} href={`#${contract.name}`}>{contract.name}<small>v{contract.versions[0]?.version}</small></a>)}</nav></aside><section className="catalog-events">{filtered.length?filtered.map((contract)=><CatalogEvent key={contract.id} application={application} contract={contract} siteUrl={siteUrl}/>):<div className="catalog-empty"><h2>{contracts.length?"No matching events":"No published contracts"}</h2><p>{contracts.length?"Try a different event name or description.":"Publish an event contract from the PayloadGrid dashboard."}</p></div>}</section></div></main>;
}

function CatalogEvent({ application, contract, siteUrl }: { application: Application; contract: CatalogContract; siteUrl: string }) {
  const [selectedVersion,setSelectedVersion]=useState(contract.versions[0]?.version||1);
  const [language,setLanguage]=useState<Language>("curl");
  const [copied,setCopied]=useState(false);
  const version=contract.versions.find((item)=>item.version===selectedVersion)||contract.versions[0];
  if(!version)return null;
  const latest=contract.versions[0]?.version;
  const snippets=integrationSnippets(siteUrl,application.id,contract.name,version.example);
  async function copySnippet(){await navigator.clipboard.writeText(snippets[language]);setCopied(true);window.setTimeout(()=>setCopied(false),1500);}
  function downloadSchema(){const blob=new Blob([JSON.stringify(version.schema,null,2)],{type:"application/schema+json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${contract.name}-v${version.version}.schema.json`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),0);}
  return <article id={contract.name}><header><div><span>EVENT CONTRACT</span><h2>{contract.name}</h2><p>{contract.description||"No description provided."}</p></div><CatalogTestButton applicationId={application.id} eventType={contract.name} payload={version.example} version={version.version}/></header><div className="catalog-version-bar"><label>Contract version<select value={selectedVersion} onChange={(event)=>setSelectedVersion(Number(event.target.value))}>{contract.versions.map((item)=><option value={item.version} key={item.version}>v{item.version}{item.version===latest?" · latest":""}</option>)}</select></label><span>Published {new Date(version.publishedAt).toLocaleDateString()}</span><button className="button secondary small" onClick={downloadSchema}><Download size={14}/> Download schema</button></div><section className="catalog-payload"><div><h3>Example payload</h3><span>v{version.version}</span></div><pre>{JSON.stringify(version.example??{},null,2)}</pre></section><section className="catalog-schema"><div><h3>JSON Schema 2020-12</h3><button className="button secondary small" onClick={downloadSchema}><FileJson size={14}/> JSON</button></div><pre>{JSON.stringify(version.schema,null,2)}</pre></section><section className="catalog-code"><div className="catalog-code-head"><div className="catalog-code-tabs" role="tablist" aria-label="Integration language">{(["curl","typescript","python"] as Language[]).map((item)=><button role="tab" aria-selected={language===item} className={language===item?"active":""} key={item} onClick={()=>setLanguage(item)}>{item==="curl"?"cURL":item==="typescript"?"TypeScript":"Python"}</button>)}</div><button className="icon-button" onClick={()=>void copySnippet()} title="Copy integration example" aria-label="Copy integration example">{copied?<Check size={15}/>:<Clipboard size={15}/>}</button></div><pre><code>{snippets[language]}</code></pre></section><section className={version.compatibilityWarnings.length?"catalog-changelog warning":"catalog-changelog"}><div><Code2 size={17}/><h3>Version change</h3></div>{version.version===1?<p>Initial contract version.</p>:version.compatibilityWarnings.length?version.compatibilityWarnings.map((warning)=><p key={warning}>{warning}</p>):<p>No backward-compatibility warnings were recorded for this version.</p>}</section></article>;
}

function integrationSnippets(siteUrl:string,applicationId:string,eventType:string,example:unknown):Record<Language,string>{
  const body=JSON.stringify({applicationId,eventType,payload:example??{}},null,2);
  const payload=JSON.stringify(example??{},null,2);
  return {
    curl:`curl -X POST ${siteUrl}/api/v1/messages \\
  -H "Authorization: Bearer $PAYLOADGRID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: UNIQUE_EVENT_KEY" \\
  -d '${body.replaceAll("'","'\\''")}'`,
    typescript:`import { PayloadGrid } from "@payloadgrid/sdk";

const payloadgrid = new PayloadGrid({ apiKey: process.env.PAYLOADGRID_API_KEY! });

await payloadgrid.send({
  applicationId: "${applicationId}",
  eventType: "${eventType}",
  payload: ${payload}
}, { idempotencyKey: "UNIQUE_EVENT_KEY" });`,
    python:`import json
import os
from payloadgrid import PayloadGrid

client = PayloadGrid(api_key=os.environ["PAYLOADGRID_API_KEY"])

client.send(
    application_id="${applicationId}",
    event_type="${eventType}",
    payload=json.loads(r'''${JSON.stringify(example??{})}'''),
    idempotency_key="UNIQUE_EVENT_KEY"
)`
  };
}
