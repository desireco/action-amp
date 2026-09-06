// Better Stack's public frontend tag. Keep local work out of production
// telemetry; collection details remain remotely configurable.
if (!['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
  (function(b,e,t,r){
    b[t]=b[t]||function(...args){(b[t].q=b[t].q||[]).push(args)};
    b[t].l=+new Date;
    var s=e.createElement('script'); s.async=1; s.crossOrigin='anonymous';
    s.src='https://betterstack.net/b.js?t='+r;
    (e.head||e.getElementsByTagName('head')[0]).appendChild(s);
  })(window,document,'betterstack','Ey5cXoAwuh172E8RXW6dbF1F');
  betterstack('init', { environment: 'production' });
}
