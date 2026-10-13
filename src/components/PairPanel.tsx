import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { buildPairHash } from '../lib/pair';
import { encodeQr, qrSvgPath } from '../lib/qr';

interface PairPanelProps {
  /** The sync code to pair with. Empty means "no code yet". */
  code: string;
  /** The sync server to point the phone at. */
  serverUrl: string;
}

/**
 * "Pair a phone": a QR code carrying the sync code and server in the URL hash.
 *
 * The phone's **camera app** does the scanning — the code holds a link, so no
 * in-app scanner and no camera permission are needed, and it works on iOS as
 * well as Android. The link is built in an effect because it reads
 * `window.location`, which does not exist during a server render.
 */
export function PairPanel({ code, serverUrl }: PairPanelProps) {
  const { strings } = useI18n();
  const copy = strings.pair;
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || typeof window === 'undefined') {
      setLink('');
      return;
    }
    const hash = buildPairHash(code, serverUrl);
    setLink(`${window.location.origin}${window.location.pathname}${hash}`);
  }, [code, serverUrl]);

  const qr = useMemo(() => {
    if (!link) return null;
    try {
      return qrSvgPath(encodeQr(link));
    } catch {
      // A payload beyond the encoder's version range: show the link, skip the symbol.
      return null;
    }
  }, [link]);

  if (!code) {
    return (
      <section className="pair" aria-label={copy.title}>
        <p className="pair__title">{copy.title}</p>
        <p className="field__hint">{copy.needCode}</p>
      </section>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="pair" aria-label={copy.title}>
      <p className="pair__title">{copy.title}</p>
      <p className="field__hint">{copy.intro}</p>

      {qr ? (
        <div className="pair__code">
          <svg
            className="pair__qr"
            viewBox={`0 0 ${qr.viewSize} ${qr.viewSize}`}
            role="img"
            aria-label={copy.title}
            shapeRendering="crispEdges"
          >
            {/* A white plate: the symbol must be dark-on-light whatever the theme. */}
            <rect width={qr.viewSize} height={qr.viewSize} fill="#ffffff" />
            <path d={qr.d} fill="#000000" />
          </svg>
        </div>
      ) : null}

      <div className="sync__row">
        <button type="button" className="btn btn--sm" onClick={handleCopy} disabled={!link}>
          {copied ? copy.copied : copy.copyLink}
        </button>
      </div>

      <p className="field__hint">{copy.steps}</p>
    </section>
  );
}
