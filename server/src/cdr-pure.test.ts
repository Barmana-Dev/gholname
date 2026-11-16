import { describe, expect, it } from "vitest";
import {
  CdrRejectedError,
  assertSafeReconstructedPdf,
  sanitizeKml,
} from "./cdr-pure.js";

const hostileKml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<NetworkLink><Link><href>http://evil.example/x.kml</href></Link></NetworkLink>
<Style id="s"><IconStyle><Icon><href>http://evil.example/i.png</href></Icon></IconStyle></Style>
<Placemark><name><![CDATA[قطعه <script>alert(1)</script> & x]]></name>
<description><![CDATA[<img src=x onerror=alert(1)>متن]]></description>
<styleUrl>#s</styleUrl><ExtendedData><Data name="a"><value>zzz</value></Data></ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>51.1,35.1,0 51.2,35.1,0 51.2,35.2,0 51.1,35.1,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
<Point><coordinates>51.3,35.3</coordinates></Point></Placemark></Document></kml>`;

describe("sanitizeKml", () => {
  it("rebuilds only whitelisted content", () => {
    const output = sanitizeKml(hostileKml);
    for (const forbidden of ["NetworkLink", "href", "<script", "onerror", "ExtendedData", "styleUrl", "Style"])
      expect(output).not.toContain(forbidden);
    expect(output).toContain("<coordinates>51.3,35.3</coordinates>");
    expect(output).toContain("&amp;");
  });
  it.each([
    ["DTD", '<!DOCTYPE x [<!ENTITY a "b">]><kml><Placemark><Point><coordinates>1,1</coordinates></Point></Placemark></kml>'],
    ["non numeric coordinates", "<kml><Placemark><Point><coordinates>1,1);alert(1)</coordinates></Point></Placemark></kml>"],
    ["out of range", "<kml><Placemark><Point><coordinates>999,1</coordinates></Point></Placemark></kml>"],
    ["no placemark", "<kml><Document/></kml>"],
  ])("rejects %s", (_label, input) => {
    expect(() => sanitizeKml(input)).toThrow(CdrRejectedError);
  });
});

describe("assertSafeReconstructedPdf", () => {
  it("accepts an image-only PDF and counts pages", () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type /Pages /Count 1>>endobj\n2 0 obj<</Type /Page /Parent 1 0 R>>endobj");
    expect(assertSafeReconstructedPdf(pdf, 10)).toBe(1);
  });
  it.each([
    ["JavaScript", "%PDF-1.4\n<</Type /Page /AA <</O <</S /JavaScript>>>>>>"],
    ["OpenAction", "%PDF-1.4\n<</Type /Page>> /OpenAction 3 0 R"],
    ["embedded file", "%PDF-1.4\n<</Type /Page>> /EmbeddedFile 3 0 R"],
    ["not a PDF", "<html>"],
  ])("rejects %s", (_label, input) => {
    expect(() => assertSafeReconstructedPdf(Buffer.from(input), 10)).toThrow(CdrRejectedError);
  });
  it("rejects too many pages", () => {
    const pdf = Buffer.from("%PDF-1.4\n<</Type /Page>><</Type /Page>><</Type /Page>>");
    expect(() => assertSafeReconstructedPdf(pdf, 2)).toThrow(CdrRejectedError);
  });
});
