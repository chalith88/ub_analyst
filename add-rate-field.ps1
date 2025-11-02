# Add default rate field to Seylan Personal Loan and Education Loan products
$data = Get-Content "output\seylan.json" | ConvertFrom-Json

foreach ($row in $data) {
    if ($row.product -eq "Personal Loan" -and $row.ratePLTier1WithCreditCardInternetBanking) {
        $rateValue = [double]($row.ratePLTier1WithCreditCardInternetBanking -replace '%','')
        $row | Add-Member -MemberType NoteProperty -Name "rate" -Value $rateValue -Force
    }
    elseif ($row.product -eq "Education Loan" -and $row.rateEduSecuredWithCreditCardInternetBanking) {
        $rateValue = [double]($row.rateEduSecuredWithCreditCardInternetBanking -replace '%','')
        $row | Add-Member -MemberType NoteProperty -Name "rate" -Value $rateValue -Force
    }
}

$data | ConvertTo-Json -Depth 10 -Compress | Out-File "output\seylan.json" -Encoding utf8
Write-Host "Added rate fields to Seylan PL and EDU products"
