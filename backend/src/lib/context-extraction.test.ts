import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractionStatusFor, runContextExtraction } from "./context-extraction";
import { aiProvider } from "./ai";

test("extractionStatusFor: idream_k12 is always 'extracted'", () => {
  assert.equal(extractionStatusFor({ sourceType: "idream_k12", hasVisionKey: false, extractedText: null }), "extracted");
});

test("extractionStatusFor: any real text means 'extracted'", () => {
  assert.equal(extractionStatusFor({ sourceType: "pdf", hasVisionKey: false, extractedText: "hello" }), "extracted");
  assert.equal(extractionStatusFor({ sourceType: "image", hasVisionKey: true, extractedText: "hello" }), "extracted");
});

test("extractionStatusFor: whitespace-only text does not count as extracted", () => {
  assert.equal(extractionStatusFor({ sourceType: "pdf", hasVisionKey: false, extractedText: "   \n\t" }), "failed_no_text");
});

test("extractionStatusFor: an image with no vision key is 'pending', not failed", () => {
  assert.equal(extractionStatusFor({ sourceType: "image", hasVisionKey: false, extractedText: null }), "pending");
});

test("extractionStatusFor: an image with a vision key but no text is 'failed_no_text'", () => {
  assert.equal(extractionStatusFor({ sourceType: "image", hasVisionKey: true, extractedText: null }), "failed_no_text");
});

test("extractionStatusFor: a document with no text is 'failed_no_text'", () => {
  assert.equal(extractionStatusFor({ sourceType: "pdf", hasVisionKey: true, extractedText: null }), "failed_no_text");
});

test("runContextExtraction: image without a vision key stays pending and is never sent to the model", async (t) => {
  const original = process.env.AWS_BEARER_TOKEN_BEDROCK;
  delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  let called = false;
  const originalFn = aiProvider.describeImageForContext;
  aiProvider.describeImageForContext = async () => {
    called = true;
    return { text: "should not happen", model: "x" };
  };
  t.after(() => {
    aiProvider.describeImageForContext = originalFn;
    if (original === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = original;
  });

  const result = await runContextExtraction({ sourceType: "image", fileLocation: "context-sources/x/y.png" });
  assert.equal(called, false);
  assert.equal(result.extractedText, null);
  assert.equal(result.extractionStatus, "pending");
});

test("runContextExtraction: image with a vision key stores the transcription", async (t) => {
  const original = process.env.AWS_BEARER_TOKEN_BEDROCK;
  process.env.AWS_BEARER_TOKEN_BEDROCK = "test-key";
  const originalFn = aiProvider.describeImageForContext;
  aiProvider.describeImageForContext = async () => ({
    text: "Cell diagram. [Figure] labelled nucleus, membrane, cytoplasm.",
    model: "claude-haiku-4-5",
  });
  t.after(() => {
    aiProvider.describeImageForContext = originalFn;
    if (original === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = original;
  });

  const result = await runContextExtraction({ sourceType: "image", fileLocation: "context-sources/x/y.png" });
  assert.match(result.extractedText ?? "", /\[Figure\] labelled nucleus/);
  assert.equal(result.extractionStatus, "extracted");
  assert.equal(result.extractionError, null);
});

test("runContextExtraction: a vision failure is captured, not thrown", async (t) => {
  const original = process.env.AWS_BEARER_TOKEN_BEDROCK;
  process.env.AWS_BEARER_TOKEN_BEDROCK = "test-key";
  const originalFn = aiProvider.describeImageForContext;
  aiProvider.describeImageForContext = async () => {
    throw new Error("Claude image context request failed (503)");
  };
  t.after(() => {
    aiProvider.describeImageForContext = originalFn;
    if (original === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = original;
  });

  const result = await runContextExtraction({ sourceType: "image", fileLocation: "context-sources/x/y.png" });
  assert.equal(result.extractedText, null);
  assert.equal(result.extractionStatus, "failed_no_text");
  assert.match(result.extractionError ?? "", /503/);
});

test("runContextExtraction: idream_k12 needs no local extraction and is ready", async () => {
  const result = await runContextExtraction({ sourceType: "idream_k12" });
  assert.equal(result.extractedText, null);
  assert.equal(result.extractionStatus, "extracted");
});

test("runContextExtraction: a bad URL protocol fails cleanly", async () => {
  const result = await runContextExtraction({ sourceType: "url", sourceUrl: "ftp://example.com/x" });
  assert.equal(result.extractedText, null);
  assert.equal(result.extractionStatus, "failed_no_text");
  assert.ok(result.extractionError);
});

test("runContextExtraction: a real pptx buffer is extracted to text", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    '<?xml version="1.0"?><p:sld xmlns:a="x"><a:t>Newton\'s laws of motion</a:t></p:sld>'
  );
  const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

  const result = await runContextExtraction({ sourceType: "pptx", buffer });
  assert.equal(result.extractionStatus, "extracted");
  assert.match(result.extractedText ?? "", /Newton's laws of motion/);
});

test("runContextExtraction: a document type with no buffer and no file fails cleanly", async () => {
  const result = await runContextExtraction({ sourceType: "pdf" });
  assert.equal(result.extractedText, null);
  assert.equal(result.extractionStatus, "failed_no_text");
});
