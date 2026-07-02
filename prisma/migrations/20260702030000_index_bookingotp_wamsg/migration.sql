-- Index OTP rows by their WhatsApp message id (delivery-status webhook lookups).
CREATE INDEX "BookingOtp_waMessageId_idx" ON "BookingOtp"("waMessageId");
