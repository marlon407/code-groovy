<%-- Grails mid-tag: g:if inside an HTML open tag (common GSP pattern) --%>
<option value="${supportedBank.code()}"<g:if test="${supportedBank.code in params.bankCodeList}"> selected</g:if>>${message(code: "SupportedBank." + supportedBank.toString())}</option>

<%-- Control: normal g:if outside a tag should still look fine --%>
<g:if test="${ok}">
	yes
</g:if>
