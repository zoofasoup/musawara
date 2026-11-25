import test from "node:test";
import assert from "node:assert/strict";
import { asksAbout, detectAnswers, valueFrom, type DetectField } from "../pages/crm/inbox/detect.ts";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const f = (id: number, label: string, type: DetectField["type"] = "text", options: string[] = []): DetectField => ({ id, label, type, options });
const FIELDS = [f(1, "Jumlah Jamaah", "number"), f(2, "Bulan", "select", MONTHS), f(3, "Tahun", "number"), f(4, "Domisili"), f(5, "Pernah Umroh", "checkbox"), f(6, "Anak", "number"), f(7, "Umur", "number")];
const NOW = new Date("2026-11-25T00:00:00Z");
const us = (body: string) => ({ from_me: 1, body, ts: 1 });
const them = (body: string) => ({ from_me: 0, body, ts: 2 });
const found = (msgs: Array<ReturnType<typeof us>>, current: Record<string, string> = {}) => Object.fromEntries(detectAnswers(msgs, FIELDS, current, NOW).map((s) => [s.label, s.value]));

test("a short answer to our question is saved in the field's format", () => {
  assert.deepEqual(found([us("Berangkat untuk berapa orang, Kak?"), them("berempat kak")]), { "Jumlah Jamaah": "4" });
  assert.deepEqual(found([us("Kira-kira kapan rencana berangkatnya?"), them("insyaallah maret tahun depan")]), { Bulan: "Maret", Tahun: "2027" });
  assert.deepEqual(found([us("Domisili Kakak di mana?"), them("bandung")]), { Domisili: "Bandung" });
  assert.deepEqual(found([us("Sudah pernah umroh sebelumnya?"), them("sudah pernah sekali")]), { "Pernah Umroh": "1" });
  assert.deepEqual(found([us("Sudah pernah umroh sebelumnya?"), them("belum pernah")]), {}, "not yet is the empty tick box");
});

test("a numbered reply is matched to our numbered questions", () => {
  const q = "Boleh dibantu info:\n1. Berangkat untuk berapa orang?\n2. Rencana bulan dan tahun keberangkatan?\n3. Sudah pernah umroh?\n4. Domisili di mana?";
  const a = "1. 3 orang\n2. des 2026\n3. udah\n4. di surabaya";
  assert.deepEqual(found([us(q), them(a)]), { "Jumlah Jamaah": "3", Bulan: "Desember", Tahun: "2026", "Pernah Umroh": "1", Domisili: "Surabaya" });
});

test("clear statements count without a question; vague ones do not", () => {
  assert.deepEqual(found([them("kami 2 orang dewasa dan 1 anak, rencana april 2027, saya tinggal di Depok kak")]), { "Jumlah Jamaah": "2", Anak: "1", Bulan: "April", Tahun: "2027", Domisili: "Depok" });
  assert.deepEqual(found([them("halo, mau tanya harga")]), {});
  assert.deepEqual(found([them("transfer 5000000 ya")]), {}, "a stray number is not a head count");
  assert.deepEqual(found([us("Ada yang bisa dibantu?"), them("iya")]), {});
});

test("only new or different values are offered, and the later answer wins", () => {
  const chat = [us("Untuk berapa orang?"), them("2 orang"), us("Jadi berapa orang?"), them("jadinya 5 orang")];
  assert.deepEqual(found(chat), { "Jumlah Jamaah": "5" });
  assert.deepEqual(found(chat, { "1": "5" }), {});
});

test("formats: age, choice options and question detection", () => {
  assert.equal(valueFrom(FIELDS[6], "45 tahun", true, NOW), "45");
  assert.equal(valueFrom(FIELDS[1], "sep", true, NOW), "September");
  assert.equal(valueFrom(f(9, "Pembayaran", "select", ["DP", "Lunas"]), "sudah lunas ya", true, NOW), "Lunas");
  assert.equal(asksAbout("Rencana bulan dan tahun keberangkatan?", FIELDS[2]), true);
  assert.equal(asksAbout("Terima kasih ya", FIELDS[0]), false);
});

test("one total answering 'how many (adults, children, elderly)?' is the head count, not each part", () => {
  const parts = [...FIELDS, f(8, "Dewasa", "number"), f(10, "Lansia", "number")];
  const run = (msgs: Array<ReturnType<typeof us>>) => Object.fromEntries(detectAnswers(msgs, parts, {}, NOW).map((s) => [s.label, s.value]));
  const q = "1. Berangkat untuk berapa orang (dewasa, anak, lansia)?\n2. Rencana bulan dan tahun keberangkatan?";
  assert.deepEqual(run([us(q), them("1. 4 orang\n2. maret 2027")]), { "Jumlah Jamaah": "4", Bulan: "Maret", Tahun: "2027" });
  assert.deepEqual(run([us("Berapa orang (dewasa, anak, lansia)?"), them("4")]), { "Jumlah Jamaah": "4" });
  assert.deepEqual(run([us("1. Dewasa: berapa?\n2. Anak: berapa?\n3. Lansia: berapa?"), them("1. 2\n2. 1\n3. 0")]), { Dewasa: "2", Anak: "1", Lansia: "0" });
});
