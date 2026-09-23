-- Two students in the same class can't share a clicker number. Safe: no
-- seatNumber has ever been set before this migration, so no duplicates exist.
CREATE UNIQUE INDEX "student_stub_class_section_id_seat_number_key" ON "student_stub"("class_section_id", "seat_number");
