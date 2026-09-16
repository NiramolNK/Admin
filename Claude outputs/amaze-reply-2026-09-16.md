# Reply to Ascend Commerce — Amaze Open API

Two versions below: English first, Thai second. Send whichever fits the thread.

---

## ENGLISH

**Subject:** Amaze Open API — the specific order fields our service agents cannot access today

Dear [Name],

Thank you for the clear answers, and for offering to review a concrete example with your
team. Taking your three points in order.

**1. Seller chat**

Understood, and thank you for confirming it plainly — that saves us building toward
something that isn't there. We will keep handling Amaze conversations in Seller Center.
If external chat access is on your roadmap at any point, we would appreciate being told;
we are not asking you to commit to a date.

That said, it makes the next two points *more* important rather than less. Our original
request grouped chat, order detail and returns together for one reason: an agent answering
a customer needs all three in front of them. With chat staying inside Seller Center, the
order and return information has to carry that weight on its own — it is the reference our
agents answer from.

**2. Order details — what we are missing**

You are right that we already consume your Open API; the order feed reaches our data
warehouse daily. So the gap is not access, it is the content of a few specific fields.
Here is exactly what arrives today versus what a service agent needs on a live call:

| Field | What reaches us today | What our agents need |
|---|---|---|
| **Order status** | `UNKNOWN` on every row | The real lifecycle status — paid / packed / shipped / delivered / cancelled — and the time it last changed |
| **Buyer phone** | Masked to first and last digit, e.g. `0******7` | A way to *find* the order from the phone number the customer gives us (the stored value can stay masked) |
| **Buyer name** | Not present | The name entered at checkout |
| **Delivery address** | Empty | At minimum province and district |
| **Shipment** | Tracking number only, e.g. `ANLKEX00458701` | Courier name, current shipment status, and delivered timestamp |
| **Voucher** | Amount only, e.g. ฿50 | The voucher name or code, so the agent can explain the deduction |

Order status is the one that hurts most. We checked both August and September 2026 and it
is `UNKNOWN` on 100% of Amaze rows, so this looks structural rather than a timing lag. For
comparison, the same pipeline receives `Shipped` and `Ready to Ship` from our other
marketplace feeds, which is why we believe the difference sits in the Amaze order payload.

One honest caveat: these observations are taken from the data as it lands in our
warehouse. If any of these fields are in fact already returned by the Open API and the gap
is on our side, please do say so — that would be the fastest fix of all, and we would
rather find that out than ask you for work you have already done.

**The example you asked for**

A customer calls our service line: *"I ordered MAGGI Dipping on 16 September — where is
it?"* She does not have the Amaze order number. She has her phone number, which is how she
identifies herself.

Today the agent cannot look the order up by that phone number, because the number we hold
is masked. Even once the order is located by other means, the status field reads `UNKNOWN`,
so the agent cannot tell her whether it has shipped. The agent ends the call, opens Seller
Center, finds it manually, and calls her back. That round trip is the gap, and it happens
on every Amaze enquiry.

**3. On searching by buyer phone number or name — yes, this is an additional requirement**

To answer your question directly: yes, and it is the single most valuable one. Customers
reach us by phone and LINE, not through the platform, and they almost never have an order
number to hand. Phone number is how they identify themselves, so lookup by phone number
(and by name as a fallback) is what turns the order feed into something an agent can
actually use while the customer is still on the line.

**4. Returns and refunds**

Understood that this is Seller Center only and not available through the Open API, and we
are not asking you to build an API for it.

We would still value it in some form, because "where is my refund?" is among the most
common questions our agents receive, and it is the one they currently have no way to answer
without leaving the conversation. Any lighter-weight option would help — a scheduled
report, a periodic export, or simply a notification when a return is raised against one of
our shops. If none of those is possible, we will keep it manual and stop asking.

Happy to join a call with your technical team if that is easier than email.

Best regards,

Niramol Kaewpradap
Crea Co., Ltd.

---

## THAI / ภาษาไทย

**หัวข้อ:** Amaze Open API — ข้อมูลออเดอร์ที่ทีมบริการลูกค้าของเรายังเข้าถึงไม่ได้

เรียน คุณ [ชื่อ]

ขอบคุณสำหรับคำตอบที่ชัดเจน และขอบคุณที่เสนอจะนำตัวอย่างไปหารือกับทีมที่เกี่ยวข้องค่ะ
ขออนุญาตตอบตามลำดับทั้งสามข้อ

**1. ระบบแชทของ Seller Center**

รับทราบค่ะ และขอบคุณที่แจ้งอย่างตรงไปตรงมา ทำให้เราไม่ต้องพัฒนาระบบไปในทิศทางที่ยังไม่มี
รองรับ เราจะยังคงดูแลการสนทนาของ Amaze ผ่าน Seller Center ต่อไป หากในอนาคตมีแผนเปิดให้
เชื่อมต่อแชทจากภายนอก รบกวนแจ้งให้เราทราบด้วยจะขอบคุณมากค่ะ — ไม่ได้ขอให้ยืนยันกำหนดเวลา
แต่อย่างใด

อย่างไรก็ตาม เรื่องนี้ทำให้อีกสองข้อที่เหลือ*สำคัญยิ่งขึ้น* ไม่ใช่น้อยลง เหตุผลที่เราขอ
ทั้งแชท ข้อมูลออเดอร์ และข้อมูลการคืนสินค้าไปพร้อมกันตั้งแต่แรก ก็เพราะเจ้าหน้าที่ที่กำลัง
ตอบลูกค้าจำเป็นต้องเห็นทั้งสามอย่างพร้อมกัน เมื่อแชทยังคงอยู่เฉพาะใน Seller Center ข้อมูล
ออเดอร์และการคืนสินค้าจึงต้องรับน้ำหนักนั้นแทน เพราะเป็นข้อมูลอ้างอิงที่เจ้าหน้าที่ใช้ตอบ
ลูกค้าโดยตรง

**2. ข้อมูลออเดอร์ — ส่วนที่เรายังขาด**

ถูกต้องค่ะว่าเราใช้ Open API ของท่านอยู่แล้ว ข้อมูลออเดอร์เข้าคลังข้อมูลของเราทุกวัน
ดังนั้นปัญหาจึงไม่ใช่เรื่องการเข้าถึง แต่เป็นเนื้อหาของบางฟิลด์ ตารางด้านล่างคือสิ่งที่เรา
ได้รับในปัจจุบัน เทียบกับสิ่งที่เจ้าหน้าที่จำเป็นต้องใช้ขณะคุยกับลูกค้า

| ข้อมูล | ที่ได้รับปัจจุบัน | ที่เจ้าหน้าที่ต้องการ |
|---|---|---|
| **สถานะออเดอร์** | `UNKNOWN` ทุกรายการ | สถานะจริง — ชำระเงินแล้ว / แพ็คแล้ว / จัดส่งแล้ว / ส่งถึงแล้ว / ยกเลิก พร้อมเวลาที่เปลี่ยนสถานะล่าสุด |
| **เบอร์โทรลูกค้า** | ปิดบังเหลือตัวแรกและตัวสุดท้าย เช่น `0******7` | ความสามารถในการ*ค้นหา*ออเดอร์จากเบอร์ที่ลูกค้าแจ้ง (ค่าที่จัดเก็บยังปิดบังไว้ได้) |
| **ชื่อลูกค้า** | ไม่มี | ชื่อที่ลูกค้ากรอกตอนสั่งซื้อ |
| **ที่อยู่จัดส่ง** | ว่างเปล่า | อย่างน้อยระดับจังหวัดและอำเภอ |
| **การจัดส่ง** | มีเพียงเลขพัสดุ เช่น `ANLKEX00458701` | ชื่อบริษัทขนส่ง สถานะการจัดส่งปัจจุบัน และเวลาที่ส่งถึง |
| **ส่วนลด/โค้ด** | มีเพียงจำนวนเงิน เช่น 50 บาท | ชื่อหรือรหัสโค้ดส่วนลด เพื่อให้เจ้าหน้าที่อธิบายยอดที่ถูกหักได้ |

เรื่องที่กระทบมากที่สุดคือสถานะออเดอร์ เราตรวจสอบทั้งเดือนสิงหาคมและกันยายน 2569 พบว่าเป็น
`UNKNOWN` ครบ 100% ของรายการ Amaze จึงน่าจะเป็นปัญหาเชิงโครงสร้างมากกว่าความล่าช้าของข้อมูล
เพื่อเปรียบเทียบ ระบบเดียวกันนี้ได้รับสถานะ `Shipped` และ `Ready to Ship` จากช่องทางอื่น
ตามปกติ เราจึงเข้าใจว่าความแตกต่างอยู่ที่ข้อมูลออเดอร์ฝั่ง Amaze

ขออนุญาตเรียนตามตรงข้อหนึ่ง ข้อสังเกตทั้งหมดนี้มาจากข้อมูลที่เข้าสู่คลังข้อมูลของเรา
หากฟิลด์ใดมีให้อยู่แล้วใน Open API และปัญหาอยู่ที่ฝั่งเรา รบกวนแจ้งกลับได้เลยค่ะ นั่นจะเป็น
ทางแก้ที่เร็วที่สุด และเราอยากทราบมากกว่าจะรบกวนให้ท่านทำงานที่ท่านทำไว้แล้ว

**ตัวอย่างที่ท่านขอ**

ลูกค้าโทรเข้ามาที่ศูนย์บริการของเรา: *"สั่ง MAGGI Dipping ไปวันที่ 16 กันยายน ของอยู่ไหนคะ"*
ลูกค้าไม่มีเลขที่ออเดอร์ของ Amaze มีเพียงเบอร์โทรศัพท์ที่ใช้ยืนยันตัวตน

ปัจจุบันเจ้าหน้าที่ไม่สามารถค้นหาออเดอร์จากเบอร์โทรนั้นได้ เพราะเบอร์ที่เรามีถูกปิดบังไว้
และถึงแม้จะหาออเดอร์เจอด้วยวิธีอื่น ช่องสถานะก็ขึ้นว่า `UNKNOWN` เจ้าหน้าที่จึงไม่สามารถ
บอกลูกค้าได้ว่าสินค้าจัดส่งแล้วหรือยัง สุดท้ายต้องวางสาย เปิด Seller Center ค้นหาด้วยตนเอง
แล้วโทรกลับ ขั้นตอนย้อนกลับไปมานี้คือช่องว่างที่เกิดขึ้นกับทุกสายที่สอบถามเรื่อง Amaze

**3. การค้นหาด้วยเบอร์โทรหรือชื่อลูกค้า — ใช่ค่ะ เป็นความต้องการเพิ่มเติม**

ขอตอบคำถามของท่านโดยตรง: ใช่ค่ะ และเป็นสิ่งที่มีคุณค่าที่สุดในบรรดาทั้งหมด ลูกค้าติดต่อเรา
ทางโทรศัพท์และ LINE ไม่ได้ติดต่อผ่านแพลตฟอร์ม และแทบไม่เคยมีเลขที่ออเดอร์ติดตัวมา เบอร์
โทรศัพท์คือสิ่งที่ลูกค้าใช้ยืนยันตัวตน การค้นหาด้วยเบอร์โทร (และใช้ชื่อเป็นทางเลือกสำรอง)
จึงเป็นสิ่งที่จะทำให้ข้อมูลออเดอร์ใช้งานได้จริงขณะที่ลูกค้ายังถือสายอยู่

**4. การคืนสินค้าและคืนเงิน**

รับทราบว่าข้อมูลส่วนนี้มีเฉพาะใน Seller Center และยังไม่เปิดผ่าน Open API และเราไม่ได้ขอให้
ท่านพัฒนา API สำหรับเรื่องนี้ค่ะ

แต่เรายังคงเห็นคุณค่าของข้อมูลส่วนนี้ในรูปแบบใดก็ได้ เพราะคำถามว่า "เงินคืนถึงไหนแล้ว" เป็น
หนึ่งในคำถามที่เจ้าหน้าที่ได้รับบ่อยที่สุด และเป็นคำถามที่ปัจจุบันไม่สามารถตอบได้เลยโดยไม่
ต้องออกจากบทสนทนา ทางเลือกที่เบากว่าก็ช่วยได้มาก เช่น รายงานตามรอบ ไฟล์ export เป็นระยะ
หรือเพียงการแจ้งเตือนเมื่อมีการขอคืนสินค้าของร้านค้าเรา หากไม่มีทางเลือกใดเป็นไปได้ เราจะ
ดำเนินการด้วยตนเองต่อไปและจะไม่รบกวนเรื่องนี้อีกค่ะ

หากสะดวกจะนัดประชุมกับทีมเทคนิคของท่านแทนการตอบอีเมล เรายินดีอย่างยิ่งค่ะ

ขอแสดงความนับถือ

นิรมล แก้วประดับ
บริษัท ครีเอ จำกัด
