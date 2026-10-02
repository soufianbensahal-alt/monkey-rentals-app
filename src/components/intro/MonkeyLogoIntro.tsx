import type { CSSProperties } from 'react'
import logo from './logo-data.json'

function Glyphs({mask=false}:{mask?:boolean}) {
  return <>{logo.letters.map((letter,index)=><g className="app-intro-glyph" key={index} style={{animationDelay:`${300+index*25}ms`} as CSSProperties}><path d={letter.d} transform={`matrix(${letter.matrix.join(' ')})`} fill={mask?'white':letter.fill}/></g>)}</>
}

export function MonkeyLogoIntro() {
  return <div className="app-intro-logo-stage" aria-hidden="true">
    <svg viewBox="0 0 1600 250" role="img">
      <defs>
        <clipPath id="app-intro-reveal"><rect className="app-intro-reveal" x="270" y="0" height="250"/></clipPath>
        <mask id="app-intro-letters" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="250"><Glyphs mask/></mask>
        <linearGradient id="app-intro-sheen-gradient"><stop offset="0" stopColor="#fff9ee" stopOpacity="0"/><stop offset=".5" stopColor="#fff9ee" stopOpacity=".24"/><stop offset="1" stopColor="#fff9ee" stopOpacity="0"/></linearGradient>
      </defs>
      <foreignObject x={logo.icon.x} y={logo.icon.y} width={logo.icon.width} height={logo.icon.height}>
        <div className="app-intro-symbol">
          <picture><source media="(max-width: 639px)" srcSet="/intros/movil/monkey.png"/><img src="/intros/pc/monkey.png" alt=""/></picture>
        </div>
      </foreignObject>
      <g clipPath="url(#app-intro-reveal)"><Glyphs/><g className="app-intro-sheen" mask="url(#app-intro-letters)"><rect x="210" y="-40" width="54" height="340" fill="url(#app-intro-sheen-gradient)" transform="skewX(-14)"/></g></g>
    </svg>
  </div>
}
