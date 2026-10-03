import type { CSSProperties } from 'react'
import logo from './logo-data.json'

function Glyphs({mask=false,mobile=false}:{mask?:boolean;mobile?:boolean}) {
  return <>{logo.letters.map((letter,index)=><g className={`app-intro-glyph${mobile?' app-intro-glyph--mobile':''}`} key={index} style={{animationDelay:`${300+index*25}ms`} as CSSProperties}><path d={letter.d} transform={`matrix(${letter.matrix.join(' ')})`} fill={mask?'white':letter.fill}/></g>)}</>
}

export function MonkeyLogoIntro() {
  return <div className="app-intro-brand" aria-hidden="true">
    <div className="app-intro-logo-stage app-intro-logo-stage--desktop">
      <svg viewBox="0 0 1600 250" role="img">
        <defs>
          <clipPath id="app-intro-desktop-reveal"><rect className="app-intro-reveal" x="270" y="0" height="250"/></clipPath>
          <mask id="app-intro-desktop-letters" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="250"><Glyphs mask/></mask>
          <linearGradient id="app-intro-desktop-sheen"><stop offset="0" stopColor="#fff9ee" stopOpacity="0"/><stop offset=".5" stopColor="#fff9ee" stopOpacity=".24"/><stop offset="1" stopColor="#fff9ee" stopOpacity="0"/></linearGradient>
        </defs>
        <foreignObject x={logo.icon.x} y={logo.icon.y} width={logo.icon.width} height={logo.icon.height}>
          <div className="app-intro-symbol"><img src="/monkey-logo.png" alt=""/></div>
        </foreignObject>
        <g clipPath="url(#app-intro-desktop-reveal)"><Glyphs/><g className="app-intro-sheen" mask="url(#app-intro-desktop-letters)"><rect x="210" y="-40" width="54" height="340" fill="url(#app-intro-desktop-sheen)" transform="skewX(-14)"/></g></g>
      </svg>
    </div>
    <div className="app-intro-mobile-stage">
      <svg className="app-intro-mobile-wordmark" viewBox="270 0 1330 250" role="img">
        <defs>
          <clipPath id="app-intro-mobile-reveal"><rect className="app-intro-reveal app-intro-reveal--mobile" x="270" y="0" width="1330" height="250"/></clipPath>
          <mask id="app-intro-mobile-letters" maskUnits="userSpaceOnUse" x="270" y="0" width="1330" height="250"><Glyphs mask mobile/></mask>
          <linearGradient id="app-intro-mobile-sheen"><stop offset="0" stopColor="#fff9ee" stopOpacity="0"/><stop offset=".5" stopColor="#fff9ee" stopOpacity=".24"/><stop offset="1" stopColor="#fff9ee" stopOpacity="0"/></linearGradient>
        </defs>
        <g clipPath="url(#app-intro-mobile-reveal)"><Glyphs mobile/><g className="app-intro-sheen" mask="url(#app-intro-mobile-letters)"><rect x="210" y="-40" width="54" height="340" fill="url(#app-intro-mobile-sheen)" transform="skewX(-14)"/></g></g>
      </svg>
      <img className="app-intro-mobile-monkey app-intro-symbol" src="/monkey-logo.png" alt=""/>
    </div>
  </div>
}
