import React from "react";
import type { Order, Supplier, Customer, PrintTemplateConfig, OrderDetail } from "../types";
import { PrintProductName } from "./PrintProductName";
import { formatEnglishNumber } from "../utils/formatters";

interface Props {
  order: Order; supplier?: Supplier; customer?: Customer; config: PrintTemplateConfig;
  title: string; number: string; date: string; validity: string; issueDate: string;
  packing: boolean; copper: boolean; currency: string;
  metadata: Array<[string, React.ReactNode]>;
  rows: Array<{item: OrderDetail; index: number; quantity: number; unitPrice: number; grossWeight: number}>;
  nameFor: (item: OrderDetail)=>string; descriptionFor:(item:OrderDetail)=>string;
  hsFor:(item:OrderDetail)=>string; packingFor:(item:OrderDetail)=>string;
  subtotal: number; freight: number; total: number; terms: React.ReactNode;
  stampText?: string;
}

/** Both designs share live commercial data; only presentation differs. */
export function MultiItemCommercialTemplate(p: Props) {
  const {supplier:s,customer:c,config,order}=p;
  const grossVisible = p.packing || Boolean(config.showGrossWeight);
  const packingVisible = p.packing || Boolean(config.showPackingColumn);
  const accent=p.copper?"#ac431e":"#007889";
  const pale=p.copper?"#fff4ed":"#ecf7f8";
  const heading:React.CSSProperties={fontSize:`${config.textSizes?.sectionTitlePt??8}pt`,fontWeight:700,color:accent,marginBottom:4};
  const card:React.CSSProperties={background:p.copper?"transparent":pale,borderRadius:p.copper?0:5,padding:7,minWidth:0};
  const n=(value:number)=>formatEnglishNumber(value,2);
  const stamp=config.artworkSizeOverrides?.stampSize??s?.PrintStampSize??config.stampSize??140;
  const signature=config.artworkSizeOverrides?.signatureSize??s?.PrintSignatureSize??config.signatureSize??160;
  const hasArtwork=Boolean(s?.StampT?.startsWith("data:image")||s?.SignT?.startsWith("data:image"));
  const bank=[s?.Bank&&["Bank",s.Bank],s?.BankBranch&&["Branch / Branch Code",s.BankBranch],s?.BankAddress&&["Bank Address",s.BankAddress],s?.SwiftCode&&["SWIFT",s.SwiftCode],s?.AccountNo&&["Account No.",s.AccountNo],s?.IBAN&&["IBAN",s.IBAN]].filter(Boolean) as string[][];
  return <div data-multi-item-template={p.copper?"graphite_copper":"teal_multi_item"} style={{display:"flex",flexDirection:"column",flex:"1 0 auto",gap:8,color:"#142334",fontSize:10,lineHeight:1.3,borderLeft:p.copper?undefined:`4px solid ${accent}`,paddingLeft:p.copper?0:6}}>
    <header data-standard-block="header" style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:`2px solid ${accent}`,paddingBottom:8}}>
      <div style={{maxWidth:"46%"}}>{s?.LogoT?<img src={s.LogoT} alt={s.SupplierName} style={{width:(config.logoSize??64)*2.5,maxWidth:"100%",height:config.logoSize??64,objectFit:"contain",objectPosition:"left center"}}/>:<b style={{fontSize:18}}>{s?.SupplierName||order.SupplierName}</b>}</div>
      <div style={{textAlign:"right"}}><h1 style={{fontSize:19,fontWeight:800,color:p.copper?"#27282d":accent,marginBottom:4}}>{p.title}</h1><div><b>No.</b> {p.number}</div><div><b>Date</b> {p.date}</div>{!p.packing&&<div><b>Validity</b> {p.validity}</div>}</div>
    </header>
    <div style={{display:"grid",gridTemplateColumns:config.showConsignee?"1fr 1fr 1fr":"1fr 1fr",gap:6}}>
      <section data-standard-block="seller" style={card}><h2 style={heading}>SELLER</h2><b>{s?.SupplierName||order.SupplierName}</b><div style={{whiteSpace:"pre-line"}}>{s?.Address}</div>{s?.Tel&&<div>Tel: {s.Tel}</div>}{s?.Email&&<div>Email: {s.Email}</div>}</section>
      <section data-standard-block="buyer" style={card}><h2 style={heading}>BUYER</h2><b>{c?.CustomerName||order.CustomerName}</b><div style={{whiteSpace:"pre-line"}}>{c?.Address}</div>{c?.Tel&&<div>Tel: {c.Tel}</div>}</section>
      {config.showConsignee&&<section data-standard-block="consignee" style={card}><h2 style={heading}>CONSIGNEE</h2><div style={{whiteSpace:"pre-line"}}>{config.consigneeText||"The Same As Buyer"}</div></section>}
    </div>
    <section data-standard-block="logistics"><h2 style={heading}>COMMERCIAL AND SHIPPING DETAILS</h2><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:`1px solid ${accent}`}}>{p.metadata.map(([label,value])=><div key={label} style={{display:"grid",gridTemplateColumns:"46% 54%",borderBottom:"1px solid #d6e0e5",padding:"3px 5px",gap:3,minWidth:0}}><b>{label}</b><span style={{overflowWrap:"anywhere"}}>{value||"—"}</span></div>)}</div></section>
    <section data-standard-block="items"><h2 style={heading}>{p.packing?"GOODS AND PACKING DETAILS":"GOODS AND PRICING DETAILS"}</h2>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:`${config.textSizes?.tablePt??8}pt`}}><thead style={{background:p.copper?"#303238":accent,color:"white"}}><tr>{["Item Description",...(config.showHsCode?["HS Code"]:[]),"Quantity (MT)",...(!p.packing?[`Unit Price (${p.currency}/MT)`]:[]),...(grossVisible?["Gross Weight (KG)"]:[]),...(packingVisible?["Packages"]:[]),...(!p.packing?[`Amount (${p.currency})`]:[])].map(label=><th key={label} style={{padding:"5px 4px",textAlign:label==="Item Description"?"left":"center",fontWeight:600}}>{label}</th>)}</tr></thead>
      <tbody>{p.rows.map(row=>{const detail=p.descriptionFor(row.item);return <React.Fragment key={row.item.OrderDetailID||row.index}><tr style={{borderTop:row.index?"1px solid #bdcdd5":undefined}}>
        <td style={{padding:`5px 4px ${detail?0:5}px`,width:"27%",verticalAlign:"top"}}><PrintProductName text={p.nameFor(row.item)} namePt={config.textSizes?.productNamePt} detailPt={config.textSizes?.productDetailPt}/></td>
        {config.showHsCode&&<td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"center"}}>{p.hsFor(row.item)}</td>}
        <td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"center"}}>{n(row.quantity)}</td>
        {!p.packing&&<td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"right"}}>{n(row.unitPrice)}</td>}
        {grossVisible&&<td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"right"}}>{n(row.grossWeight)}</td>}
        {packingVisible&&<td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"center"}}>{p.packingFor(row.item)}</td>}
        {!p.packing&&<td style={{padding:"5px 4px",verticalAlign:"top",textAlign:"right"}}>{n(row.quantity*row.unitPrice)}</td>}
      </tr>{detail&&<tr><td colSpan={2+Number(Boolean(config.showHsCode))+Number(!p.packing)*2+Number(grossVisible)+Number(packingVisible)} style={{padding:"0 4px 4px",border:0}}><div style={{width:0,minWidth:"100%"}}><div data-print-product-detail data-preferred-size-pt={config.textSizes?.productDetailPt} style={{whiteSpace:"nowrap",fontSize:9,lineHeight:1,color:"#52616d"}}>{detail}</div></div></td></tr>}</React.Fragment>;})}</tbody>
      </table>
    </section>
    <section data-standard-block="totals" style={{display:"flex",flexWrap:"wrap",background:pale,border:`1px solid ${accent}`,borderRadius:p.copper?0:5}}>
      {[["Total Quantity (MT)",n(p.rows.reduce((a,r)=>a+r.quantity,0))],["Total Gross Weight (KG)",n(p.rows.reduce((a,r)=>a+r.grossWeight,0))],...(p.packing?[["Total Net Weight (KG)",n(p.rows.reduce((a,r)=>a+r.quantity*1000,0))]]:[["Total Amount",`${p.currency} ${n(p.subtotal)}`],...(config.showFreightRow?[["Freight",`${p.currency} ${n(p.freight)}`]]:[]),["Total Amount Due",`${p.currency} ${n(p.total)}`]])].map(([label,value])=><div key={label} style={{flex:"1 1 100px",padding:"6px 5px",textAlign:"center",minWidth:0}}><b style={{display:"block",fontSize:9}}>{label}</b><strong style={{display:"block",fontSize:label==="Total Amount Due"?14:11,color:accent,marginTop:3}}>{value}</strong></div>)}
    </section>
    {p.stampText&&<div style={{alignSelf:"flex-end",border:"2px solid #dc2626",padding:"3px 10px",color:"#dc2626",fontWeight:800}}>{p.stampText}</div>}
    {!p.packing&&p.terms&&<section data-standard-block="terms" style={{borderTop:`1px solid ${accent}`,paddingTop:5}}><h2 style={heading}>TERMS &amp; CONDITIONS</h2><div style={{columnCount:2,columnGap:16}}>{p.terms}</div></section>}
    <footer data-standard-block="footer" style={{marginTop:"auto",flexShrink:0,display:"grid",gridTemplateColumns:config.showBankDetails&&(config.showSignatory||config.showStampSignature)?"1fr 1fr":"1fr",gap:10,borderTop:`1px solid ${accent}`,paddingTop:6}}>
      {config.showBankDetails&&<section><h2 style={heading}>BANK DETAILS</h2>{bank.map(([label,value])=><div key={label} style={{display:"grid",gridTemplateColumns:"35% 65%",gap:4,padding:"2px 0",borderBottom:"1px solid #e0e6e9",fontSize:9}}><b>{label}</b><span style={{overflowWrap:"anywhere",whiteSpace:"pre-line"}}>{value}</span></div>)}</section>}
      {(config.showSignatory||config.showStampSignature)&&<section data-authorization><h2 style={heading}>AUTHORIZATION · STAMP &amp; SIGNATURE</h2>{config.showSignatory&&<><div><b>Name of Signatory:</b> {order.NameOfSignatory||s?.Signatory}</div><div><b>Date of Issue:</b> {p.issueDate}</div></>}
        {config.showStampSignature&&<div style={{position:"relative",height:hasArtwork?Math.max(55,stamp*.7,signature*.7):45,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{s?.StampT?.startsWith("data:image")&&<img src={s.StampT} alt="Company stamp" style={{maxWidth:"48%",maxHeight:stamp*.7,objectFit:"contain"}}/>}{s?.SignT?.startsWith("data:image")&&<img src={s.SignT} alt="Authorized signature" style={{maxWidth:"48%",maxHeight:signature*.7,objectFit:"contain"}}/>}</div>}
      </section>}
    </footer>
  </div>;
}
