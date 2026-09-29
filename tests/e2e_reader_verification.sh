#!/usr/bin/env bash
# ==============================================================================
# E2E Verification Script for Synced Web Reader
# Target: http://reader.thangnd26 (or custom BASE_URL)
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-http://reader.thangnd26}"
SLUG="sample-story"
CHAPTER_ID="chapter_001"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED_COUNT=0
FAILED_COUNT=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED_COUNT=$((PASSED_COUNT + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED_COUNT=$((FAILED_COUNT + 1))
}

echo -e "${YELLOW}======================================================${NC}"
echo -e "${YELLOW} Starting E2E Verification for Synced Web Reader      ${NC}"
echo -e "${YELLOW} Base URL: ${BASE_URL}                                ${NC}"
echo -e "${YELLOW}======================================================${NC}"

# Test 1: HTTP 200 on Homepage / PWA root
log_info "Test 1: Verify HTTP 200 on root (${BASE_URL}/)..."
HTTP_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
if [ "${HTTP_STATUS}" -eq 200 ]; then
    log_pass "Homepage returned HTTP 200"
else
    log_fail "Homepage returned HTTP ${HTTP_STATUS} (expected 200)"
fi

# Test 2: HTTP 200 on /api/books catalog
log_info "Test 2: Verify HTTP 200 and catalog on /api/books..."
HTTP_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/books")
BODY=$(curl -k -s "${BASE_URL}/api/books")
if [ "${HTTP_STATUS}" -eq 200 ] && echo "${BODY}" | grep -q "${SLUG}"; then
    log_pass "Catalog returned HTTP 200 and contains '${SLUG}'"
else
    log_fail "Catalog check failed (HTTP ${HTTP_STATUS}, body: ${BODY})"
fi

# Test 3: HTTP 200 on /api/books/{slug}
log_info "Test 3: Verify HTTP 200 and book detail on /api/books/${SLUG}..."
HTTP_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/books/${SLUG}")
BODY=$(curl -k -s "${BASE_URL}/api/books/${SLUG}")
if [ "${HTTP_STATUS}" -eq 200 ] && echo "${BODY}" | grep -q "${CHAPTER_ID}"; then
    log_pass "Book detail returned HTTP 200 and contains chapter '${CHAPTER_ID}'"
else
    log_fail "Book detail check failed (HTTP ${HTTP_STATUS}, body: ${BODY})"
fi

# Test 4: HTTP 206 Partial Content on Range request for audio
log_info "Test 4: Verify HTTP 206 on Range request for /api/books/${SLUG}/audio/${CHAPTER_ID}..."
RANGE_HEADER="Range: bytes=0-100"
HEADER_OUTPUT=$(curl -k -s -D - -o /dev/null -H "${RANGE_HEADER}" "${BASE_URL}/api/books/${SLUG}/audio/${CHAPTER_ID}" | tr -d '\r')
HTTP_STATUS=$(echo "${HEADER_OUTPUT}" | head -n 1 | awk '{print $2}')
if [ "${HTTP_STATUS}" -eq 206 ] && echo "${HEADER_OUTPUT}" | grep -iq "content-range: bytes 0-100/"; then
    log_pass "Audio endpoint returned HTTP 206 Partial Content with valid Content-Range header"
else
    log_fail "Audio range request failed (HTTP ${HTTP_STATUS}, headers:\n${HEADER_OUTPUT})"
fi

# Test 5: HTTP 200 on Kosync progress push (POST /api/books/{slug}/sync)
log_info "Test 5: Verify HTTP 200 on Kosync progress push (POST /api/books/${SLUG}/sync)..."
SYNC_PAYLOAD='{"chapter_id":"chapter_001","cue_id":"cue-3","percentage":0.55,"progress":"chapter_001#cue-3","device":"E2EVerification"}'
SYNC_RESP=$(curl -k -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/books/${SLUG}/sync" \
    -H "Content-Type: application/json" \
    -d "${SYNC_PAYLOAD}")
SYNC_BODY=$(echo "${SYNC_RESP}" | sed '$d')
SYNC_STATUS=$(echo "${SYNC_RESP}" | tail -n 1)

if [ "${SYNC_STATUS}" -eq 200 ] && echo "${SYNC_BODY}" | grep -q '"status":"ok"'; then
    log_pass "Kosync progress push returned HTTP 200 and confirmed sync"
else
    log_fail "Kosync progress push failed (HTTP ${SYNC_STATUS}, body: ${SYNC_BODY})"
fi

# Test 6: HTTP 200 on Kosync progress pull (GET /api/books/{slug}/sync)
log_info "Test 6: Verify HTTP 200 on Kosync progress pull (GET /api/books/${SLUG}/sync)..."
PULL_RESP=$(curl -k -s -w "\n%{http_code}" "${BASE_URL}/api/books/${SLUG}/sync")
PULL_BODY=$(echo "${PULL_RESP}" | sed '$d')
PULL_STATUS=$(echo "${PULL_RESP}" | tail -n 1)

if [ "${PULL_STATUS}" -eq 200 ] && echo "${PULL_BODY}" | grep -q 'cue-3'; then
    log_pass "Kosync progress pull returned HTTP 200 and matched saved position ('cue-3')"
else
    log_fail "Kosync progress pull failed (HTTP ${PULL_STATUS}, body: ${PULL_BODY})"
fi

echo -e "${YELLOW}======================================================${NC}"
echo -e " Summary: ${GREEN}${PASSED_COUNT} Passed${NC}, ${RED}${FAILED_COUNT} Failed${NC}"
echo -e "${YELLOW}======================================================${NC}"

if [ "${FAILED_COUNT}" -eq 0 ]; then
    echo -e "${GREEN}ALL END-TO-END TESTS PASSED SUCCESSFULLY!${NC}"
    exit 0
else
    echo -e "${RED}SOME TESTS FAILED!${NC}"
    exit 1
fi
