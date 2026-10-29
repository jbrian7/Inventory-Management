export const toteQrOptions = {
  type: "svg" as const,
  margin: 4,
  errorCorrectionLevel: "M" as const,
};

export function labelPageCss(mode: "label" | "sheet") {
  const page =
    mode === "sheet"
      ? "@page { size: letter; margin: 0.5in; }"
      : "@page { size: 2in 2in; margin: 0.08in; }";
  return `${page}
@media print {
  html, body { background: #fff !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
}
.tote-label {
  box-sizing: border-box;
  width: 2in;
  height: 2in;
  padding: 0.08in;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.04in;
  overflow: hidden;
  background: #fff;
  color: #000;
  text-align: center;
}
.tote-label .business { font-size: 7pt; line-height: 1.1; }
.tote-label h2 {
  margin: 0;
  font-size: 16pt;
  line-height: 1.05;
  font-weight: 700;
  max-width: 1.84in;
  overflow: hidden;
}
.tote-label .shelf { font-size: 8pt; line-height: 1.1; max-width: 1.84in; }
.tote-label .qr { width: 1.22in; height: 1.22in; }
.tote-label .qr svg { display: block; width: 100%; height: 100%; }
`;
}
