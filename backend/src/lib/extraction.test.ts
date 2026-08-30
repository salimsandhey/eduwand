import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractPptxText, extractText, isPrivateOrLoopbackAddress } from "./extraction";

async function makePptx(slides: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, inner] of Object.entries(slides)) {
    zip.file(
      `ppt/slides/${name}`,
      `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="x" xmlns:p="y"><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`
    );
  }
  // A file that must be ignored (not under ppt/slides/slideN.xml).
  zip.file("ppt/notesSlides/notesSlide1.xml", "<a:t>speaker note that should be ignored</a:t>");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

test("extractPptxText joins text runs on a slide", async () => {
  const buf = await makePptx({ "slide1.xml": "<a:t>Photosynthesis</a:t><a:t>in plants</a:t>" });
  assert.equal(await extractPptxText(buf), "Photosynthesis in plants");
});

test("extractPptxText orders slides numerically, not lexically", async () => {
  const buf = await makePptx({
    "slide2.xml": "<a:t>second</a:t>",
    "slide10.xml": "<a:t>tenth</a:t>",
    "slide1.xml": "<a:t>first</a:t>",
  });
  assert.equal(await extractPptxText(buf), "first\n\nsecond\n\ntenth");
});

test("extractPptxText decodes XML entities", async () => {
  const buf = await makePptx({ "slide1.xml": "<a:t>Acids &amp; Bases &lt;pH&gt; &#65;</a:t>" });
  assert.equal(await extractPptxText(buf), "Acids & Bases <pH> A");
});

test("extractPptxText keeps runs that span newlines", async () => {
  const buf = await makePptx({ "slide1.xml": "<a:t>line one\nline two</a:t>" });
  assert.equal(await extractPptxText(buf), "line one\nline two");
});

test("extractPptxText ignores non-slide xml (speaker notes)", async () => {
  const buf = await makePptx({ "slide1.xml": "<a:t>only this</a:t>" });
  assert.equal(await extractPptxText(buf), "only this");
});

test("extractText returns null for an unsupported source type", async () => {
  assert.equal(await extractText(Buffer.from("whatever"), "image"), null);
});

test("isPrivateOrLoopbackAddress blocks private / loopback / link-local ranges", () => {
  for (const addr of [
    "127.0.0.1",
    "127.9.9.9",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.1.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "not-an-ip",
  ]) {
    assert.equal(isPrivateOrLoopbackAddress(addr), true, `${addr} should be blocked`);
  }
});

test("isPrivateOrLoopbackAddress allows public addresses", () => {
  for (const addr of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "203.0.113.10", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateOrLoopbackAddress(addr), false, `${addr} should be allowed`);
  }
});
