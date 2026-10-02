import React from 'react'
import {AbsoluteFill,Easing,Img,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion'
import data from './logo-data.json'

const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.22,0,.18,1)} as const
const movement=(frame:number,index:number)=>interpolate(frame,[18+index*1.5,42+index*2],[-11,0],clamp)

const Glyphs:React.FC<{mask?:boolean;synchronized?:boolean}>=({mask=false,synchronized=false})=>{
  const frame=useCurrentFrame()
  return <>{data.letters.map((letter,index)=><g key={index} transform={`translate(${synchronized?0:movement(frame,index)} 0)`} opacity={interpolate(frame,synchronized?[18,42]:[18+index*1.5,26+index*1.5],[0,1],clamp)}><path d={letter.d} transform={`matrix(${letter.matrix.join(' ')})`} fill={mask?'white':letter.fill}/></g>)}</>
}

export const MonkeyIntro:React.FC<{iconFile:string;layout?:'horizontal'|'stacked'}>=({iconFile,layout='horizontal'})=>{
  const frame=useCurrentFrame()
  const {width,height}=useVideoConfig()
  const stacked=layout==='stacked'
  const wordmarkWidth=width*.86
  const wordmarkHeight=wordmarkWidth*(250/1330)
  const monkeyWidth=width*.62
  const monkeyHeight=monkeyWidth*(1032/1239)
  const gap=height*.018
  const stackHeight=wordmarkHeight+gap+monkeyHeight
  const logoWidth=width*(height>width?.82:.78)
  const scale=logoWidth/1600
  const boxHeight=250*scale
  const sweep=interpolate(frame,[60,102],[220,1720],clamp)
  const revealWidth=interpolate(frame,[18,72],[0,1330],clamp)
  return <AbsoluteFill style={{backgroundColor:'#F6F3EC'}}>
    <div style={{position:'absolute',left:stacked?(width-wordmarkWidth)/2:(width-logoWidth)/2,top:stacked?(height-stackHeight)/2:(height-boxHeight)/2,width:stacked?wordmarkWidth:logoWidth,height:stacked?stackHeight:boxHeight,display:stacked?'flex':'block',flexDirection:'column',alignItems:'center',gap:stacked?gap:0}}>
      <svg width={stacked?wordmarkWidth:logoWidth} height={stacked?wordmarkHeight:boxHeight} viewBox={stacked?'270 0 1330 250':'0 0 1600 250'} style={{overflow:'visible',flex:'none'}}>
        <defs>
          <clipPath id="reveal"><rect x={stacked?935-revealWidth/2:270} y="0" width={revealWidth} height="250"/></clipPath>
          <mask id="letter-silhouettes" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="250"><Glyphs mask synchronized={stacked}/></mask>
          <linearGradient id="fine-sheen"><stop offset="0" stopColor="#FFF9EE" stopOpacity="0"/><stop offset=".5" stopColor="#FFF9EE" stopOpacity=".23"/><stop offset="1" stopColor="#FFF9EE" stopOpacity="0"/></linearGradient>
        </defs>
        {!stacked?<foreignObject x={data.icon.x} y={data.icon.y} width={data.icon.width} height={data.icon.height}>
          <div style={{width:'100%',height:'100%',opacity:interpolate(frame,[0,24],[0,1],clamp),scale:interpolate(frame,[0,24],[.96,1],clamp),transformOrigin:'center'}}><Img src={staticFile(iconFile)} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>
        </foreignObject>:null}
        <g clipPath="url(#reveal)"><Glyphs synchronized={stacked}/>{frame>=60&&frame<102?<g mask="url(#letter-silhouettes)"><path d={`M${sweep-22} -30 L${sweep+22} -30 L${sweep-57} 280 L${sweep-101} 280 Z`} fill="url(#fine-sheen)" opacity={interpolate(frame,[60,63,99,102],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/></g>:null}</g>
      </svg>
      {stacked?<Img src={staticFile(iconFile)} style={{width:monkeyWidth,height:monkeyHeight,objectFit:'contain',opacity:interpolate(frame,[0,24],[0,1],clamp),scale:interpolate(frame,[0,24],[.96,1],clamp),transformOrigin:'center',flex:'none'}}/>:null}
    </div>
  </AbsoluteFill>
}
